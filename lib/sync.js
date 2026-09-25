import 'server-only';
import { db, check } from './db';
import { getMembers, getOrCreateWeek } from './data';
import { fetchScores } from './providers';
import { fetchNflCurrentWeek } from './nfl';
import { getGames } from './games';

// Pulls one week's fantasy scores and saves them against each member's
// mapped team. Returns a short summary for the admin screen.
export async function syncWeek(settings, weekNum) {
  const [week, members, results] = await Promise.all([
    getOrCreateWeek(settings.season, weekNum),
    getMembers(),
    fetchScores(settings, weekNum),
  ]);
  const byTeam = Object.fromEntries(results.map((r) => [r.teamId, r.points]));
  const rows = [];
  const unmapped = [];
  for (const m of members) {
    if (!m.external_team_id) { unmapped.push(m.name); continue; }
    const pts = byTeam[m.external_team_id];
    if (pts === undefined) { unmapped.push(m.name); continue; }
    rows.push({ week_id: week.id, member_id: m.id, points: pts, source: settings.platform, updated_at: new Date().toISOString() });
  }
  if (rows.length) check(await db().from('scores').upsert(rows, { onConflict: 'week_id,member_id' }));
  return { saved: rows.length, unmapped };
}

// Hands-off daily job: follows the NFL to the current week (opening it for
// picks), refreshes the slate and auto-grades finished games, and pulls
// fantasy scores for this week and last.
export async function autoSync(settings) {
  let current = settings.current_week;
  const nflWeek = await fetchNflCurrentWeek().catch(() => null);
  if (nflWeek && nflWeek > current) {
    current = nflWeek;
    await getOrCreateWeek(settings.season, current);
    check(await db().from('settings').update({ current_week: current }).eq('id', 1));
  }
  const s = { ...settings, current_week: current };
  const weeks = current > 1 ? [current - 1, current] : [current];
  const out = { current, nflWeek, games: {}, scores: {} };
  for (const w of weeks) {
    if (w >= settings.ml_start_week) out.games[w] = (await getGames(s.season, w, { force: true })).length;
    if (s.platform !== 'manual') {
      try { out.scores[w] = await syncWeek(s, w); } catch (e) { out.scores[w] = { error: e.message }; }
    }
  }
  return out;
}
