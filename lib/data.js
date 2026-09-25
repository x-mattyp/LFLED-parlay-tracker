import 'server-only';
import { db, check } from './db';

export async function getSettings() {
  return check(await db().from('settings').select('*').eq('id', 1).single());
}

export async function getMembers() {
  return check(
    await db().from('members').select('id, name, is_admin, external_team_id, team_name, team_abbr, team_logo, team_owner, pin_hash').order('name')
  ).map(({ pin_hash, ...m }) => ({ ...m, has_pin: !!pin_hash }));
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
