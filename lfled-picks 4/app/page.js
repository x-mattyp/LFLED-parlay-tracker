import Link from 'next/link';
import { requireMember } from '@/lib/session';
import { getSettings, getWeekBundle, getScoresFor } from '@/lib/data';
import { getGames, hasStarted } from '@/lib/games';
import { lowScorers, allScoresIn, parlayResult } from '@/lib/stats';
import GameBoard from './board';

const LABEL = { win: 'WIN', loss: 'LOSS', push: 'PUSH', pending: 'Pending' };
const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
const kickoffFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit',
});

function gameLabel(g) {
  if (g.completed) return 'Final';
  if (hasStarted(g)) return g.status_detail || 'In progress';
  return `${kickoffFmt.format(new Date(g.kickoff))} ET`;
}

export default async function WeekPage({ searchParams }) {
  const me = await requireMember();
  const settings = await getSettings();
  const sp = await searchParams;
  const current = settings.current_week;
  const n = Math.min(Math.max(Number(sp.week) || current, 1), current);
  const matchupWeek = n >= settings.ml_start_week;

  // Load games first: this refreshes from ESPN and auto-grades finished games.
  const games = matchupWeek ? await getGames(settings.season, n) : [];
  const [{ week, members, scores, picks }, prevScores] = await Promise.all([
    getWeekBundle(settings.season, n),
    n > 1 ? getScoresFor(settings.season, n - 1) : Promise.resolve([]),
  ]);

  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const pickOf = Object.fromEntries(picks.map((p) => [p.member_id, p]));
  const gameOf = Object.fromEntries(games.map((g) => [g.event_id, g]));
  const myPick = pickOf[me.id];

  const buyers = allScoresIn(prevScores, members) ? lowScorers(prevScores).map((id) => nameOf[id]) : [];
  const complete = allScoresIn(scores, members);
  const nextBuyers = complete ? lowScorers(scores) : [];

  const legs = [...members].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));
  const status = parlayResult(picks);
  const board = [...scores].sort((a, b) => Number(b.points) - Number(a.points));

  const boardGames = games.map((g) => {
    const holderPick = picks.find((p) => p.event_id === g.event_id);
    return {
      eventId: g.event_id,
      label: gameLabel(g),
      started: hasStarted(g),
      away: { id: g.away_id, name: g.away_name, abbr: g.away_abbr, logo: g.away_logo, ml: g.away_ml, score: g.away_score },
      home: { id: g.home_id, name: g.home_name, abbr: g.home_abbr, logo: g.home_logo, ml: g.home_ml, score: g.home_score },
      holder: holderPick
        ? { name: nameOf[holderPick.member_id], mine: holderPick.member_id === me.id, teamId: holderPick.team_id, abbr: holderPick.team_abbr }
        : null,
    };
  });
  const myGame = myPick?.event_id ? gameOf[myPick.event_id] : null;

  function legText(p) {
    if (!p.event_id) return `${p.bet}${p.odds ? ` (${p.odds})` : ''}`;
    const g = gameOf[p.event_id];
    const opp = g ? (p.team_id === g.home_id ? `vs ${g.away_abbr}` : `@ ${g.home_abbr}`) : '';
    return `${p.team_name} ML${p.odds ? ` (${p.odds})` : ''} ${opp}`.trim();
  }

  return (
    <>
      <div className="weekhead">
        <div>
          <p className="muted small">{settings.season} season</p>
          <h1>Week {n}</h1>
        </div>
        <div className="arrows">
          <Link className="arrow" href={`/?week=${n - 1}`} aria-disabled={n <= 1} aria-label="Previous week">‹</Link>
          <Link className="arrow" href={`/?week=${n + 1}`} aria-disabled={n >= current} aria-label="Next week">›</Link>
        </div>
      </div>

      {buyers.length ? (
        <div className="buyer">
          <strong>{buyers.join(' & ')}</strong>
          <span>{buyers.length > 1 ? 'tied for low score and are' : 'had the low score and is'} buying this week&rsquo;s parlay.</span>
        </div>
      ) : (
        <div className="buyer quiet">
          {n === 1 ? 'Week 1 has no low scorer to pay yet.' : `Buyer shows up once all of week ${n - 1}'s scores are in.`}
        </div>
      )}

      <section className="slip" aria-label={`Week ${n} parlay`}>
        <div className="slip-top">
          <h3>{picks.length}-leg parlay</h3>
          <span className={`stamp big ${status}`}>{LABEL[status]}</span>
        </div>
        <div className="slip-meta">
          <div><span>Picks in</span><b>{picks.length}/{members.length}</b></div>
          <div><span>Stake</span><b>{money(week.stake)}</b></div>
          <div><span>Odds</span><b>{week.odds || '—'}</b></div>
          <div><span>To win</span><b>{money(week.payout)}</b></div>
          {week.locked && <div><span>Picks</span><b>Locked</b></div>}
        </div>
        <div className="perf" aria-hidden="true" />
        <ul className="legs">
          {legs.map((m) => {
            const p = pickOf[m.id];
            return (
              <li key={m.id} className={`leg${m.id === me.id ? ' mine' : ''}`}>
                <span className="who">{m.name}</span>
                <span className={`bet${p ? '' : ' empty'}`}>{p ? legText(p) : 'No pick yet'}</span>
                {p?.rationale && <q className="why">{p.rationale}</q>}
                {p && <span className={`stamp ${p.result}`}>{LABEL[p.result]}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      {matchupWeek ? (
        <>
          <h2>Pick a team to win</h2>
          <p className="muted small">
            Moneyline only. Once someone takes a game, both sides are off the board. Picks lock at kickoff.
          </p>
          {boardGames.length ? (
            <GameBoard
              weekId={week.id}
              locked={week.locked}
              games={boardGames}
              myPick={
                myPick?.event_id
                  ? { eventId: myPick.event_id, teamId: myPick.team_id, rationale: myPick.rationale, started: myGame ? hasStarted(myGame) : false }
                  : null
              }
            />
          ) : (
            <p className="muted">This week&rsquo;s games haven&rsquo;t loaded from ESPN yet. Check back in a few minutes.</p>
          )}
        </>
      ) : (
        <p className="muted small">Picks for week {n} were entered by the commissioner.</p>
      )}

      <h2>Fantasy scores</h2>
      {board.length ? (
        <ol className="board">
          {board.map((s, i) => (
            <li key={s.member_id} className={nextBuyers.includes(s.member_id) ? 'low' : ''}>
              <span className="rank">{i + 1}</span>
              <span>
                {nameOf[s.member_id]}
                {nextBuyers.includes(s.member_id) && <span className="note">Buys week {n + 1}&rsquo;s parlay</span>}
              </span>
              <span className="pts">{Number(s.points).toFixed(2)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No scores yet. They sync from ESPN every morning.</p>
      )}
      {board.length > 0 && !complete && (
        <p className="muted small">{members.length - scores.length} score(s) still missing, so next week&rsquo;s buyer isn&rsquo;t final.</p>
      )}
    </>
  );
}
