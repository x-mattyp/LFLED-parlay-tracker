import 'server-only';
import { db, check } from './db';
import { getOrCreateWeek } from './data';
import { fetchNflWeek } from './nfl';

const MAX_AGE_MS = 3 * 60 * 1000;
const LIVE_MAX_AGE_MS = 45 * 1000; // while games are being played

export function hasStarted(g, now = Date.now()) {
  return g.state !== 'pre' || new Date(g.kickoff).getTime() <= now;
}

function isFresh(games) {
  if (!games.length) return false;
  const open = games.filter((g) => !g.completed);
  const playing = open.some((g) => hasStarted(g));
  const maxAge = playing ? LIVE_MAX_AGE_MS : MAX_AGE_MS;
  return open.every((g) => Date.now() - new Date(g.updated_at).getTime() < maxAge);
}

// Returns the week's games, refreshing from ESPN when stale, and grades any
// pending picks whose game has gone final.
export async function getGames(season, week, { force = false } = {}) {
  const existing = check(await db().from('games').select('*').eq('season', season).eq('week', week).order('kickoff'));
  if (!force && isFresh(existing)) return existing;
  let games;
  try {
    games = await fetchNflWeek(season, week);
  } catch {
    return existing; // keep showing what we have if ESPN hiccups
  }
  if (!games.length) return existing;
  check(await db().from('games').upsert(games, { onConflict: 'event_id' }));
  await gradeWeek(season, week, games);
  return games.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
}

async function gradeWeek(season, week, games) {
  const done = games.filter((g) => g.completed);
  if (!done.length) return;
  const w = await getOrCreateWeek(season, week);
  const pending = check(
    await db().from('picks').select('member_id, event_id, team_id').eq('week_id', w.id).eq('result', 'pending')
      .in('event_id', done.map((g) => g.event_id))
  );
  for (const p of pending) {
    const g = done.find((x) => x.event_id === p.event_id);
    const result = g.winner_id ? (g.winner_id === p.team_id ? 'win' : 'loss') : g.home_score === g.away_score ? 'push' : null;
    if (!result) continue;
    check(
      await db().from('picks').update({ result, updated_at: new Date().toISOString() })
        .eq('week_id', w.id).eq('member_id', p.member_id)
    );
  }
}
