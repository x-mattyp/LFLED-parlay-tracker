import Link from 'next/link';
import { requireMember } from '@/lib/session';
import { getSettings, getWeekBundle, getScoresFor } from '@/lib/data';
import { lowScorers, allScoresIn, parlayResult } from '@/lib/stats';
import { savePick } from './actions';

const LABEL = { win: 'WIN', loss: 'LOSS', push: 'PUSH', pending: 'Pending' };
const money = (n) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

export default async function WeekPage({ searchParams }) {
  const me = await requireMember();
  const settings = await getSettings();
  const sp = await searchParams;
  const current = settings.current_week;
  const n = Math.min(Math.max(Number(sp.week) || current, 1), current);

  const [{ week, members, scores, picks }, prevScores] = await Promise.all([
    getWeekBundle(settings.season, n),
    n > 1 ? getScoresFor(settings.season, n - 1) : Promise.resolve([]),
  ]);

  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const pickOf = Object.fromEntries(picks.map((p) => [p.member_id, p]));
  const myPick = pickOf[me.id];

  // Who pays this week: last week's low scorer(s).
  const buyers = allScoresIn(prevScores, members) ? lowScorers(prevScores).map((id) => nameOf[id]) : [];
  // Who pays next week: this week's low scorer(s), once every score is in.
  const complete = allScoresIn(scores, members);
  const nextBuyers = complete ? lowScorers(scores) : [];

  const legs = [...members].sort((a, b) => (a.id === me.id ? -1 : b.id === me.id ? 1 : a.name.localeCompare(b.name)));
  const status = parlayResult(picks);
  const board = [...scores].sort((a, b) => Number(b.points) - Number(a.points));

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
                <span className={`bet${p ? '' : ' empty'}`}>
                  {p ? `${p.bet}${p.odds ? ` (${p.odds})` : ''}` : 'No pick yet'}
                </span>
                {p && <span className={`stamp ${p.result}`}>{LABEL[p.result]}</span>}
              </li>
            );
          })}
        </ul>

        {!week.locked && (
          <form action={savePick} className="mypick">
            <input type="hidden" name="week_id" value={week.id} />
            <div className="row">
              <label>
                {myPick ? 'Change your pick' : 'Your pick'}
                <input name="bet" defaultValue={myPick?.bet || ''} placeholder="Bills -3.5" maxLength={120} />
              </label>
              <label>
                Odds
                <input name="odds" defaultValue={myPick?.odds || ''} placeholder="-110" maxLength={12} />
              </label>
            </div>
            <button>{myPick ? 'Update pick' : 'Lock in pick'}</button>
            {myPick && <p className="muted small">Clear the pick box and save to remove your pick.</p>}
          </form>
        )}
      </section>

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
        <p className="muted">No scores yet. They show up after the commissioner syncs them from the league.</p>
      )}
      {board.length > 0 && !complete && (
        <p className="muted small">{members.length - scores.length} score(s) still missing, so next week&rsquo;s buyer isn&rsquo;t final.</p>
      )}
    </>
  );
}
