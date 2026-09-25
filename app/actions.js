'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, check } from '@/lib/db';
import { createSession, destroySession, requireMember, requireAdmin } from '@/lib/session';
import { getSettings, getOrCreateWeek } from '@/lib/data';
import { hasStarted } from '@/lib/games';
import { fetchTeams } from '@/lib/providers';
import { syncWeek, linkTeams } from '@/lib/sync';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function refresh() {
  revalidatePath('/', 'layout');
}

// ---------- Auth ----------
export async function login(_prev, formData) {
  const name = String(formData.get('name') || '');
  const pin = String(formData.get('pin') || '');
  const confirm = formData.get('confirm');

  if (!/^\d{4}$/.test(pin)) return { error: 'PIN must be exactly 4 digits.' };

  const m = check(await db().from('members').select('*').eq('name', name).limit(1))[0];
  if (!m) return { error: 'Pick your name from the list.' };

  if (m.locked_until && new Date(m.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(m.locked_until) - new Date()) / 60000);
    return { error: `Too many wrong PINs. Try again in ${mins} min, or ask the commissioner to reset it.` };
  }

  if (!m.pin_hash) {
    // First login: set the PIN (entered twice).
    if (confirm === null) return { needsConfirm: true };
    if (String(confirm) !== pin) return { needsConfirm: true, error: "PINs don't match. Try again." };
    const pin_hash = await bcrypt.hash(pin, 10);
    check(await db().from('members').update({ pin_hash, failed_attempts: 0, locked_until: null }).eq('id', m.id));
  } else if (!(await bcrypt.compare(pin, m.pin_hash))) {
    const failed = m.failed_attempts + 1;
    const locked = failed >= MAX_ATTEMPTS;
    check(
      await db()
        .from('members')
        .update({
          failed_attempts: locked ? 0 : failed,
          locked_until: locked ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
        })
        .eq('id', m.id)
    );
    return {
      error: locked
        ? `Too many wrong PINs. Locked for ${LOCK_MINUTES} minutes.`
        : `Wrong PIN. ${MAX_ATTEMPTS - failed} tries left.`,
    };
  } else if (m.failed_attempts || m.locked_until) {
    check(await db().from('members').update({ failed_attempts: 0, locked_until: null }).eq('id', m.id));
  }

  await createSession(m);
  redirect('/');
}

// Tells the login form whether this name has a PIN yet.
export async function pinStatus(name) {
  const m = check(await db().from('members').select('pin_hash').eq('name', name).limit(1))[0];
  return { hasPin: !!m?.pin_hash };
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

// ---------- Picks ----------
const RATIONALE_MIN = 10;
const RATIONALE_MAX = 280;

async function gameById(eventId) {
  return check(await db().from('games').select('*').eq('event_id', eventId).limit(1))[0] || null;
}

// Places (or replaces) one member's moneyline pick. Players go through the
// kickoff and weekly locks; the commissioner can skip them (asCommish) to
// enter a pick someone texted in. Either way the unique (week_id, event_id)
// constraint blocks two people from taking the same game.
async function placePick({ memberId, weekId, pick, rationale, asCommish }) {
  const [week, settings] = await Promise.all([
    db().from('weeks').select('*').eq('id', weekId).single().then(check),
    getSettings(),
  ]);
  if (week.week < settings.ml_start_week) return { error: 'Picks for this week are entered in the table below.' };
  if (!asCommish && week.locked) return { error: 'Picks are locked for this week.' };

  const current = check(await db().from('picks').select('event_id').eq('week_id', weekId).eq('member_id', memberId).limit(1))[0];
  const currentGame = current?.event_id ? await gameById(current.event_id) : null;
  if (!asCommish && currentGame && hasStarted(currentGame)) return { error: 'Your game already kicked off, so your pick is locked in.' };

  const [eventId, teamId] = String(pick || '').split(':');
  const why = String(rationale || '').trim().replace(/\s+/g, ' ');
  if (!eventId || !teamId) return { error: asCommish ? 'Choose a team first.' : 'Tap a team to pick first.' };
  if (!asCommish && why.length < RATIONALE_MIN) return { error: `Add a reason for your pick (at least ${RATIONALE_MIN} characters).` };

  const game = await gameById(eventId);
  if (!game || game.season !== week.season || game.week !== week.week) return { error: "That game isn't on this week's slate." };
  if (!asCommish && hasStarted(game)) return { error: 'That game already kicked off.' };
  const side = teamId === game.home_id ? 'home' : teamId === game.away_id ? 'away' : null;
  if (!side) return { error: 'Pick one of the two teams in that game.' };

  const { error } = await db()
    .from('picks')
    .upsert(
      {
        week_id: weekId,
        member_id: memberId,
        event_id: eventId,
        team_id: teamId,
        team_abbr: game[`${side}_abbr`],
        team_name: game[`${side}_name`],
        bet: `${game[`${side}_abbr`]} ML`,
        odds: game[`${side}_ml`],
        rationale: why ? why.slice(0, RATIONALE_MAX) : null,
        result: game.completed ? (game.winner_id ? (game.winner_id === teamId ? 'win' : 'loss') : 'push') : 'pending',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'week_id,member_id' }
    );
  if (error) {
    if (error.code === '23505') return { error: 'Someone already has that game. Pick another one.' };
    return { error: `Couldn't save the pick: ${error.message}` };
  }
  refresh();
  return { ok: `Locked in: ${game[`${side}_name`]} to win.`, game, side };
}

// A player's own pick from the matchup board.
export async function savePick(_prev, formData) {
  const me = await requireMember();
  const weekId = Number(formData.get('week_id'));

  if (formData.get('intent') === 'clear') {
    const week = check(await db().from('weeks').select('locked').eq('id', weekId).single());
    if (week.locked) return { error: 'Picks are locked for this week.' };
    const mine = check(await db().from('picks').select('event_id').eq('week_id', weekId).eq('member_id', me.id).limit(1))[0];
    if (!mine) return { error: "You don't have a pick to remove." };
    const g = mine.event_id ? await gameById(mine.event_id) : null;
    if (g && hasStarted(g)) return { error: 'Your game already kicked off, so your pick is locked in.' };
    check(await db().from('picks').delete().eq('week_id', weekId).eq('member_id', me.id));
    refresh();
    return { ok: 'Pick removed. Your game is open for others again.' };
  }

  const res = await placePick({
    memberId: me.id,
    weekId,
    pick: formData.get('pick'),
    rationale: formData.get('rationale'),
    asCommish: false,
  });
  return res.error ? { error: res.error } : { ok: res.ok };
}

// The commissioner placing or removing a pick for someone else.
export async function commishPick(_prev, formData) {
  await requireAdmin();
  const weekId = Number(formData.get('week_id'));
  const memberId = Number(formData.get('member_id'));
  if (!memberId) return { error: 'Choose who the pick is for.' };
  const who = check(await db().from('members').select('name, team_name').eq('id', memberId).single());
  const whoLabel = who.team_name || who.name;

  if (formData.get('intent') === 'clear') {
    check(await db().from('picks').delete().eq('week_id', weekId).eq('member_id', memberId));
    refresh();
    return { ok: `Removed ${whoLabel}'s pick.` };
  }

  const res = await placePick({
    memberId,
    weekId,
    pick: formData.get('pick'),
    rationale: formData.get('rationale'),
    asCommish: true,
  });
  if (res.error) return { error: res.error };
  return { ok: `Saved for ${whoLabel}: ${res.game[`${res.side}_name`]} to win.` };
}

// ---------- Commissioner tools ----------
export async function gradePick(formData) {
  await requireAdmin();
  const result = String(formData.get('result'));
  if (!['pending', 'win', 'loss', 'push'].includes(result)) return;
  check(
    await db()
      .from('picks')
      .update({ result, updated_at: new Date().toISOString() })
      .eq('week_id', Number(formData.get('week_id')))
      .eq('member_id', Number(formData.get('member_id')))
  );
  refresh();
}

// Weeks before matchup picking: the commissioner types each person's pick
// and result so they count toward season records.
export async function saveLegacyPicks(formData) {
  await requireAdmin();
  const weekId = Number(formData.get('week_id'));
  const members = check(await db().from('members').select('id'));
  const upserts = [];
  const deletes = [];
  for (const { id } of members) {
    const bet = String(formData.get(`bet_${id}`) || '').trim().slice(0, 120);
    if (!bet) { deletes.push(id); continue; }
    const result = String(formData.get(`result_${id}`) || 'pending');
    upserts.push({
      week_id: weekId,
      member_id: id,
      bet,
      odds: String(formData.get(`odds_${id}`) || '').trim().slice(0, 12) || null,
      result: ['pending', 'win', 'loss', 'push'].includes(result) ? result : 'pending',
      event_id: null, team_id: null, team_abbr: null, team_name: null,
      updated_at: new Date().toISOString(),
    });
  }
  if (upserts.length) check(await db().from('picks').upsert(upserts, { onConflict: 'week_id,member_id' }));
  if (deletes.length) check(await db().from('picks').delete().eq('week_id', weekId).in('member_id', deletes));
  refresh();
}

export async function toggleLock(formData) {
  await requireAdmin();
  const id = Number(formData.get('week_id'));
  const week = check(await db().from('weeks').select('locked').eq('id', id).single());
  check(await db().from('weeks').update({ locked: !week.locked }).eq('id', id));
  refresh();
}

export async function saveParlay(formData) {
  await requireAdmin();
  const num = (k) => {
    const v = String(formData.get(k) || '').replace(/[$,]/g, '').trim();
    return v === '' || isNaN(Number(v)) ? null : Number(v);
  };
  check(
    await db()
      .from('weeks')
      .update({ stake: num('stake'), payout: num('payout'), odds: String(formData.get('odds') || '').trim() || null })
      .eq('id', Number(formData.get('week_id')))
  );
  refresh();
}

export async function saveScores(formData) {
  await requireAdmin();
  const weekId = Number(formData.get('week_id'));
  const upserts = [];
  const deletes = [];
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith('score_')) continue;
    const memberId = Number(key.slice(6));
    const v = String(raw).trim();
    if (v === '') deletes.push(memberId);
    else if (!isNaN(Number(v)))
      upserts.push({ week_id: weekId, member_id: memberId, points: Number(v), source: 'manual', updated_at: new Date().toISOString() });
  }
  if (upserts.length) check(await db().from('scores').upsert(upserts, { onConflict: 'week_id,member_id' }));
  if (deletes.length) check(await db().from('scores').delete().eq('week_id', weekId).in('member_id', deletes));
  refresh();
}

export async function syncScores(_prev, formData) {
  await requireAdmin();
  try {
    const settings = await getSettings();
    const { saved, unmapped } = await syncWeek(settings, Number(formData.get('week')));
    refresh();
    if (!saved) return { error: `No scores came back from the league for week ${formData.get('week')} yet.` + (unmapped.length ? ` No team linked for ${unmapped.join(', ')}.` : '') };
    return {
      ok: `Pulled ${saved} score${saved === 1 ? '' : 's'}.` + (unmapped.length ? ` No team linked for ${unmapped.join(', ')}.` : ''),
    };
  } catch (e) {
    return { error: `Sync failed: ${e.message}` };
  }
}

export async function advanceWeek() {
  await requireAdmin();
  const s = await getSettings();
  const next = s.current_week + 1;
  await getOrCreateWeek(s.season, next);
  check(await db().from('settings').update({ current_week: next }).eq('id', 1));
  refresh();
  redirect(`/admin?week=${next}`);
}

export async function saveSettings(_prev, formData) {
  await requireAdmin();
  const season = Number(formData.get('season'));
  const current_week = Number(formData.get('current_week'));
  const platform = String(formData.get('platform'));
  const league_id = String(formData.get('league_id') || '').trim() || null;
  if (!Number.isInteger(season) || !Number.isInteger(current_week) || current_week < 1 || current_week > 22)
    return { error: 'Season and week must be whole numbers (week 1–22).' };
  if (!['manual', 'espn', 'sleeper'].includes(platform)) return { error: 'Pick a platform.' };
  check(await db().from('settings').update({ season, current_week, platform, league_id }).eq('id', 1));
  await getOrCreateWeek(season, current_week);
  refresh();
  return { ok: 'Settings saved.' };
}

// Re-links everyone to their fantasy team and refreshes team names.
export async function refreshTeams() {
  await requireAdmin();
  try {
    const { linked, missing } = await linkTeams(await getSettings());
    refresh();
    return missing.length
      ? { error: `Linked ${linked} teams. Couldn't find a team for ${missing.join(', ')}. Fix it below.` }
      : { ok: `All ${linked} teams linked.` };
  } catch (e) {
    return { error: `Couldn't reach the league: ${e.message}` };
  }
}

export async function loadTeams() {
  await requireAdmin();
  try {
    return { teams: await fetchTeams(await getSettings()) };
  } catch (e) {
    return { error: e.message };
  }
}

// Manual override for the rare case auto-linking gets someone wrong.
export async function saveTeamMap(_prev, formData) {
  await requireAdmin();
  try {
    const teams = await fetchTeams(await getSettings());
    const byId = Object.fromEntries(teams.map((t) => [t.id, t]));
    for (const [key, raw] of formData.entries()) {
      if (!key.startsWith('team_')) continue;
      const t = byId[String(raw)];
      check(
        await db()
          .from('members')
          .update(
            t
              ? { external_team_id: t.id, team_name: t.name, team_abbr: t.abbrev, team_logo: t.logo, team_owner: t.owners.join(', ') || null }
              : { external_team_id: null, team_name: null, team_abbr: null, team_logo: null, team_owner: null }
          )
          .eq('id', Number(key.slice(5)))
      );
    }
    refresh();
    return { ok: 'Team matches saved.' };
  } catch (e) {
    return { error: `Couldn't save: ${e.message}` };
  }
}

export async function resetPin(formData) {
  await requireAdmin();
  check(
    await db()
      .from('members')
      .update({ pin_hash: null, failed_attempts: 0, locked_until: null })
      .eq('id', Number(formData.get('member_id')))
  );
  refresh();
}
