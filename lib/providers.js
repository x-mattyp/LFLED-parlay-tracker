import 'server-only';

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, cache: 'no-store' });
  if (!res.ok) throw new Error(`${new URL(url).host} returned ${res.status}`);
  return res.json();
}

// ---------- Sleeper (public API, no login needed) ----------
async function sleeperTeams(leagueId) {
  const [rosters, users] = await Promise.all([
    getJson(`https://api.sleeper.app/v1/league/${leagueId}/rosters`),
    getJson(`https://api.sleeper.app/v1/league/${leagueId}/users`),
  ]);
  const userById = Object.fromEntries(users.map((u) => [u.user_id, u]));
  return rosters.map((r) => {
    const u = userById[r.owner_id];
    return { id: String(r.roster_id), name: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}` };
  });
}

async function sleeperScores(leagueId, week) {
  const matchups = await getJson(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
  return matchups.map((m) => ({ teamId: String(m.roster_id), points: Number(m.points ?? 0) }));
}

// ---------- ESPN (unofficial API; private leagues need ESPN_S2 + ESPN_SWID) ----------
function espnHeaders() {
  const { ESPN_S2, ESPN_SWID } = process.env;
  return ESPN_S2 && ESPN_SWID ? { Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}` } : {};
}

function espnUrl(season, leagueId, views, extra = '') {
  const v = views.map((x) => `view=${x}`).join('&');
  return `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${v}${extra}`;
}

async function espnTeams(season, leagueId) {
  const data = await getJson(espnUrl(season, leagueId, ['mTeam']), espnHeaders());
  return (data.teams || []).map((t) => ({
    id: String(t.id),
    name: t.name || [t.location, t.nickname].filter(Boolean).join(' ') || t.abbrev || `Team ${t.id}`,
  }));
}

async function espnScores(season, leagueId, week) {
  const data = await getJson(
    espnUrl(season, leagueId, ['mMatchupScore', 'mScoreboard'], `&scoringPeriodId=${week}`),
    espnHeaders()
  );
  const out = [];
  for (const m of data.schedule || []) {
    if (m.matchupPeriodId !== week) continue;
    for (const side of [m.home, m.away]) {
      if (!side) continue;
      const pts = side.totalPointsLive ?? side.totalPoints ?? 0;
      out.push({ teamId: String(side.teamId), points: Number(pts) });
    }
  }
  return out;
}

async function espnCurrentWeek(season, leagueId) {
  const data = await getJson(espnUrl(season, leagueId, ['mStatus']), espnHeaders());
  return Number(data.status?.currentMatchupPeriod ?? data.scoringPeriodId) || null;
}

async function sleeperCurrentWeek() {
  const state = await getJson('https://api.sleeper.app/v1/state/nfl');
  return state.season_type === 'regular' || state.season_type === 'post' ? Number(state.week) || null : null;
}

// ---------- Public entry points ----------
export async function fetchCurrentWeek(settings) {
  if (!settings.league_id) throw new Error('Add your league ID first.');
  if (settings.platform === 'sleeper') return sleeperCurrentWeek();
  if (settings.platform === 'espn') return espnCurrentWeek(settings.season, settings.league_id);
  return null;
}

export async function fetchTeams(settings) {
  if (!settings.league_id) throw new Error('Add your league ID first.');
  if (settings.platform === 'sleeper') return sleeperTeams(settings.league_id);
  if (settings.platform === 'espn') return espnTeams(settings.season, settings.league_id);
  return [];
}

export async function fetchScores(settings, week) {
  if (!settings.league_id) throw new Error('Add your league ID first.');
  if (settings.platform === 'sleeper') return sleeperScores(settings.league_id, week);
  if (settings.platform === 'espn') return espnScores(settings.season, settings.league_id, week);
  throw new Error('Score sync is off. Pick ESPN or Sleeper in league settings.');
}
