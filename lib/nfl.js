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
