'use server';

import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db, check } from '@/lib/db';
import { createSession, destroySession, requireMember, requireAdmin } from '@/lib/session';
import { getSettings, getOrCreateWeek } from '@/lib/data';
import { fetchTeams } from '@/lib/providers';
import { syncWeek } from '@/lib/sync';

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
export async function savePick(formData) {
  const me = await requireMember();
  const weekId = Number(formData.get('week_id'));
  const bet = String(formData.get('bet') || '').trim().slice(0, 120);
  const odds = String(formData.get('odds') || '').trim().slice(0, 12) || null;

  const week = check(await db().from('weeks').select('*').eq('id', weekId).single());
  if (week.locked) throw new Error('Picks are locked for this week.');

  if (!bet) {
    check(await db().from('picks').delete().eq('week_id', weekId).eq('member_id', me.id));
  } else {
    check(
      await db()
        .from('picks')
        .upsert(
          { week_id: weekId, member_id: me.id, bet, odds, result: 'pending', updated_at: new Date().toISOString() },
          { onConflict: 'week_id,member_id' }
        )
    );
  }
  refresh();
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
    return {
      ok: `Pulled ${saved} score${saved === 1 ? '' : 's'}.` + (unmapped.length ? ` No team matched for ${unmapped.join(', ')}.` : ''),
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

export async function loadTeams() {
  await requireAdmin();
  try {
    return { teams: await fetchTeams(await getSettings()) };
  } catch (e) {
    return { error: e.message };
  }
}

export async function saveTeamMap(formData) {
  await requireAdmin();
  for (const [key, raw] of formData.entries()) {
    if (!key.startsWith('team_')) continue;
    check(
      await db()
        .from('members')
        .update({ external_team_id: String(raw) || null })
        .eq('id', Number(key.slice(5)))
    );
  }
  refresh();
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
