import 'server-only';
import { db, check } from './db';

export async function getSettings() {
  return check(await db().from('settings').select('*').eq('id', 1).single());
}

const MEMBER_COLS = 'id, name, is_admin, external_team_id, team_name, team_abbr, team_logo, team_owner, pin_hash';
const LOGO_COLS = 'logo_url, logo_source, logo_error';

// Loads everyone. If the logo columns haven't been added in Supabase yet,
// falls back to the rest instead of taking the whole site down.
export async function getMembers() {
  let res = await db().from('members').select(`${MEMBER_COLS}, ${LOGO_COLS}`).order('name');
  if (res.error && /column/i.test(res.error.message)) {
    console.error('Logo columns missing; run supabase/migrate-004-logos.sql.', res.error.message);
    res = await db().from('members').select(MEMBER_COLS).order('name');
  }
  return check(res).map(({ pin_hash, ...m }) => ({ ...m, has_pin: !!pin_hash }));
}

export async function getOrCreateWeek(season, week) {
  const found = check(await db().from('weeks').select('*').eq('season', season).eq('week', week).limit(1));
  if (found[0]) return found[0];
  return check(
    await db().from('weeks').upsert({ season, week }, { onConflict: 'season,week' }).select().single()
  );
}

export async function getWeekBundle(season, weekNum) {
  const week = await getOrCreateWeek(season, weekNum);
  const [members, scores, picks] = await Promise.all([
    getMembers(),
    db().from('scores').select('*').eq('week_id', week.id).then(check),
    db().from('picks').select('*').eq('week_id', week.id).then(check),
  ]);
  return { week, members, scores, picks };
}

export async function getScoresFor(season, weekNum) {
  const w = check(await db().from('weeks').select('id').eq('season', season).eq('week', weekNum).limit(1))[0];
  if (!w) return [];
  return check(await db().from('scores').select('*').eq('week_id', w.id));
}

export async function getSeason(season) {
  const weeks = check(await db().from('weeks').select('*').eq('season', season).order('week'));
  const ids = weeks.map((w) => w.id);
  if (!ids.length) return { weeks, scores: [], picks: [], members: await getMembers() };
  const [scores, picks, members] = await Promise.all([
    db().from('scores').select('*').in('week_id', ids).then(check),
    db().from('picks').select('*').in('week_id', ids).then(check),
    getMembers(),
  ]);
  return { weeks, scores, picks, members };
}
