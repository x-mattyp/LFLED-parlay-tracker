import 'server-only';

// ESPN's public NFL scoreboard. No login needed.
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`NFL scoreboard returned ${res.status}`);
  return res.json();
}

function fmtMl(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace('+', ''));
  if (Number.isNaN(n)) return String(v);
  return n > 0 ? `+${n}` : String(n);
}

// ESPN has used two shapes for odds over the years; handle both.
function moneyline(odds, side) {
  if (!odds) return null;
  const m = odds.moneyline?.[side];
  return fmtMl(m?.close?.odds ?? m?.current?.odds ?? m?.open?.odds ?? odds[`${side}TeamOdds`]?.moneyLine);
}

export async function fetchNflWeek(season, week) {
  const data = await getJson(`${BASE}?seasontype=2&week=${week}&dates=${season}`);
  return (data.events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const home = comp.competitors?.find((c) => c.homeAway === 'home') || {};
    const away = comp.competitors?.find((c) => c.homeAway === 'away') || {};
    const odds = comp.odds?.[0];
    const t = ev.status?.type || {};
    const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
    const winner = home.winner ? home.team?.id : away.winner ? away.team?.id : null;
    return {
      event_id: String(ev.id),
      season,
      week,
      kickoff: ev.date,
      state: t.state || 'pre',
      status_detail: t.shortDetail || null,
      completed: !!t.completed,
      home_id: String(home.team?.id), home_abbr: home.team?.abbreviation, home_name: home.team?.displayName,
      home_logo: home.team?.logo || null, home_score: num(home.score), home_ml: moneyline(odds, 'home'),
      away_id: String(away.team?.id), away_abbr: away.team?.abbreviation, away_name: away.team?.displayName,
      away_logo: away.team?.logo || null, away_score: num(away.score), away_ml: moneyline(odds, 'away'),
      winner_id: winner ? String(winner) : null,
      updated_at: new Date().toISOString(),
    };
  });
}

// The NFL week ESPN considers current (regular season only).
export async function fetchNflCurrentWeek() {
  const data = await getJson(BASE);
  if (data.season?.type !== 2) return null;
  return Number(data.week?.number) || null;
}

// Full scoreboard for the Scores tab: live situation, last play, records,
// TV and a link to ESPN's game page. Cached for 20 seconds so a room full of
// people refreshing doesn't hammer ESPN.
export async function fetchScoreboard(season, week) {
  const url = `${BASE}?seasontype=2&week=${week}&dates=${season}`;
  const res = await fetch(url, { next: { revalidate: 20 } });
  if (!res.ok) throw new Error(`NFL scoreboard returned ${res.status}`);
  const data = await res.json();
  return (data.events || []).map((ev) => {
    const comp = ev.competitions?.[0] || {};
    const t = ev.status?.type || {};
    const side = (homeAway) => {
      const c = comp.competitors?.find((x) => x.homeAway === homeAway) || {};
      return {
        id: String(c.team?.id ?? ''),
        abbr: c.team?.abbreviation || '',
        name: c.team?.displayName || '',
        short: c.team?.shortDisplayName || c.team?.name || '',
        logo: c.team?.logo || null,
        score: c.score === undefined || c.score === '' ? null : Number(c.score),
        record: c.records?.[0]?.summary || null,
        winner: !!c.winner,
      };
    };
    const sit = comp.situation || {};
    const link =
      ev.links?.find((l) => l.rel?.includes('summary'))?.href ||
      ev.links?.[0]?.href ||
      `https://www.espn.com/nfl/game/_/gameId/${ev.id}`;
    return {
      id: String(ev.id),
      kickoff: ev.date,
      state: t.state || 'pre', // pre | in | post
      detail: t.shortDetail || '',
      completed: !!t.completed,
      home: side('home'),
      away: side('away'),
      possession: sit.possession ? String(sit.possession) : null,
      downDistance: sit.shortDownDistanceText || sit.downDistanceText || null,
      redZone: !!sit.isRedZone,
      lastPlay: sit.lastPlay?.text || null,
      tv: comp.broadcasts?.[0]?.names?.[0] || comp.geoBroadcasts?.[0]?.media?.shortName || null,
      odds: comp.odds?.[0]?.details || null,
      link,
    };
  });
}
