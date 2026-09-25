import Link from 'next/link';
import { requireMember } from '@/lib/session';
import { getSettings, getWeekBundle, getScoresFor } from '@/lib/data';
import { getGames, hasStarted } from '@/lib/games';
import { lowScorers, allScoresIn, parlayResult, estimateParlay, DEFAULT_STAKE } from '@/lib/stats';
import GameBoard from './board';
import PickFlow from './pickflow';
import TeamLogo from './teamlogo';

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

  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.team_name || m.name]));
  const memberOf = Object.fromEntries(members.map((m) => [m.id, m]));
  const pickOf = Object.fromEntries(picks.map((p) => [p.member_id, p]));
  const gameOf = Object.fromEntries(games.map((g) => [g.event_id, g]));
  const myPick = pickOf[me.id];

  const buyers = allScoresIn(prevScores, members) ? lowScorers(prevScores).map((id) => nameOf[id]) : [];
  const complete = allScoresIn(scores, members) && n < current;
  const nextBuyers = complete ? lowScorers(scores) : [];

  const legs = [...members].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : (a.team_name || a.name).localeCompare(b.team_name || b.name)));
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
  const stake = week.stake ?? DEFAULT_STAKE;
  const est = estimateParlay(picks, stake);

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

      {(() => {
        const counts = { win: 0, loss: 0, push: 0, pending: 0 };
        for (const p of picks) counts[p.result] += 1;
        const oddsText = week.odds || est?.american || '—';
        const winText = money(week.payout ?? est?.toWin);
        const estimated = !week.odds || week.payout == null;
        const ticketEl = (
          <section className={`ticket ${status}`} aria-label={`Week ${n} parlay ticket`}>
            <div className="ticket-head">
              <span className="book">LFLED Sportsbook</span>
              <span className="tno">#{settings.season}-W{String(n).padStart(2, '0')}</span>
              <svg className="football" viewBox="0 0 64 36" aria-hidden="true">
                <ellipse cx="32" cy="18" rx="30" ry="16" fill="#8a4b22" />
                <ellipse cx="32" cy="18" rx="30" ry="16" fill="none" stroke="#5e3114" strokeWidth="2" />
                <path d="M8 9 Q4 18 8 27 M56 9 Q60 18 56 27" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
                <path d="M20 18 H44" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                <path d="M24 14 V22 M28 14 V22 M32 14 V22 M36 14 V22 M40 14 V22" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="ticket-title">
              <div>
                <p className="kicker">Week {n} · {picks.length}-leg parlay</p>
                <p className="odds">{oddsText}</p>
              </div>
              <span className={`stamp big ${status}`}>{LABEL[status]}</span>
            </div>
            <dl className="ticket-nums">
              <div><dt>Stake</dt><dd>{money(stake)}</dd></div>
              <div><dt>{week.payout != null ? 'To win' : 'Est. to win'}</dt><dd>{winText}</dd></div>
              <div><dt>Picks in</dt><dd>{picks.length}/{members.length}</dd></div>
            </dl>
            <div className="legdots" role="img" aria-label={`${counts.win} won, ${counts.loss} lost, ${counts.push} pushed, ${counts.pending} pending, ${members.length - picks.length} missing`}>
              {legs.map((m, i) => {
                const p = pickOf[m.id];
                return <span key={m.id} style={{ '--i': i }} className={`dot ${p ? p.result : 'none'}`} title={`${m.team_name || m.name}: ${p ? LABEL[p.result] : 'No pick'}`} />;
              })}
            </div>
            <div className="ticket-foot">
              <span className="barcode" aria-hidden="true" />
              <span className="small">
                {estimated ? 'Estimated from everyone\u2019s odds' : 'Bet placed'}
                {estimated && est?.unpriced > 0 ? ` · ${est.unpriced} leg${est.unpriced === 1 ? '' : 's'} without odds left out` : ''}
                {week.locked ? ' · Picks locked' : ''}
              </span>
            </div>
          </section>
        );
        const slipEl = (
          <section className="picks" aria-label={`Week ${n} picks`}>
            <ul className="legs">
              {legs.map((m) => {
                const p = pickOf[m.id];
                return (
                  <li key={m.id} className={`leg${m.id === me.id ? ' mine' : ''}`}>
                    <TeamLogo member={m} />
                    <span className="who">
                      {m.team_name || m.name}
                      {m.team_name && <span className="owner"> {m.name}</span>}
                    </span>
                    <span className={`bet${p ? '' : ' empty'}`}>{p ? legText(p) : 'No pick yet'}</span>
                    {p?.rationale && <q className="why">{p.rationale}</q>}
                    {p && <span className={`stamp ${p.result}`}>{LABEL[p.result]}</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
        const boardEl = matchupWeek ? (
          <>
            <h2>{myPick ? 'Change your pick' : 'Pick a team to win'}</h2>
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
        ) : null;
        const canPick = matchupWeek && n === current && !week.locked && boardGames.some((g) => !g.started);
        return (
          <>
            {ticketEl}
            {!matchupWeek && <p className="muted small">Picks for week {n} were entered by the commissioner.</p>}
            <PickFlow
              key={myPick ? `${myPick.event_id}:${myPick.team_id}` : 'none'}
              pickFirst={canPick && !myPick}
              myPickLabel={matchupWeek && myPick ? legText(myPick) : null}
              canChange={canPick && !!myPick && !(myGame && hasStarted(myGame))}
              board={boardEl}
              slip={slipEl}
            />
          </>
        );
      })()}

      <h2>Fantasy scores</h2>
      {board.length ? (
        <ol className="board">
          {board.map((s, i) => (
            <li key={s.member_id} className={nextBuyers.includes(s.member_id) ? 'low' : ''}>
              <span className="rank">{i + 1}</span>
              <span>
                {nameOf[s.member_id]}
                {memberOf[s.member_id]?.team_name && <span className="owner"> {memberOf[s.member_id].name}</span>}
                {nextBuyers.includes(s.member_id) && <span className="note">Buys week {n + 1}&rsquo;s parlay</span>}
              </span>
              <span className="pts">{Number(s.points).toFixed(2)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No scores yet. They sync from ESPN every morning.</p>
      )}
      {board.length > 0 && !complete && (n === current || scores.length < members.length) && (
        <p className="muted small">
          {n < current
            ? `${members.length - scores.length} score(s) still missing, so week ${n + 1}'s buyer isn't final.`
            : `Week ${n} is still being played. The lowest score when it ends buys week ${n + 1}.`}
        </p>
      )}
    </>
  );
}
