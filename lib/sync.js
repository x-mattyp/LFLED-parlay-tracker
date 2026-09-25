import 'server-only';
import { db, check } from './db';
import { getMembers, getOrCreateWeek } from './data';
import { fetchScores } from './providers';

// Pulls one week's scores from the fantasy platform and saves them against
// each member's mapped team. Returns a short summary for the admin screen.
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
