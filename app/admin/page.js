import Link from 'next/link';
import { requireAdmin } from '@/lib/session';
import { getSettings, getWeekBundle } from '@/lib/data';
import { gradePick, toggleLock, saveParlay, saveScores, advanceWeek, resetPin } from '../actions';
import { SyncButton, SettingsForm, TeamMap } from './client';

const RESULTS = ['win', 'loss', 'push', 'pending'];
const LABEL = { win: 'Win', loss: 'Loss', push: 'Push', pending: 'Pending' };

export default async function AdminPage({ searchParams }) {
  await requireAdmin();
  const settings = await getSettings();
  const sp = await searchParams;
  const n = Math.min(Math.max(Number(sp.week) || settings.current_week, 1), settings.current_week);
  const { week, members, scores, picks } = await getWeekBundle(settings.season, n);
  const scoreOf = Object.fromEntries(scores.map((s) => [s.member_id, s]));
  const nameOf = Object.fromEntries(members.map((m) => [m.id, m.name]));

  return (
    <>
      <div className="weekhead">
        <div>
          <p className="muted small">Commissioner tools</p>
          <h1>Week {n}</h1>
        </div>
        <div className="arrows">
          <Link className="arrow" href={`/admin?week=${n - 1}`} aria-disabled={n <= 1} aria-label="Previous week">‹</Link>
          <Link className="arrow" href={`/admin?week=${n + 1}`} aria-disabled={n >= settings.current_week} aria-label="Next week">›</Link>
        </div>
      </div>

      <h2>Picks</h2>
      <div className="panel">
        <div className="inline">
          <form action={toggleLock}>
            <input type="hidden" name="week_id" value={week.id} />
            <button className="ghost">{week.locked ? 'Unlock picks' : 'Lock picks'}</button>
          </form>
          <span className="muted small">{week.locked ? 'Nobody can change their pick.' : 'Anyone can still change their pick.'}</span>
        </div>
        {picks.length ? (
          <ul className="gradelist">
            {picks.map((p) => (
              <li key={p.member_id}>
                <span><b>{nameOf[p.member_id]}</b> <span className="muted">{p.bet}{p.odds ? ` (${p.odds})` : ''}</span></span>
                <form action={gradePick} className="btns">
                  <input type="hidden" name="week_id" value={week.id} />
                  <input type="hidden" name="member_id" value={p.member_id} />
                  {RESULTS.map((r) => (
                    <button key={r} name="result" value={r} className={r} aria-pressed={p.result === r}>{LABEL[r]}</button>
                  ))}
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No picks in yet.</p>
        )}
      </div>

      <h2>Parlay ticket</h2>
      <form action={saveParlay} className="panel">
        <input type="hidden" name="week_id" value={week.id} />
        <div className="formgrid">
          <label>Stake<input name="stake" inputMode="decimal" defaultValue={week.stake ?? ''} placeholder="14" /></label>
          <label>Odds<input name="odds" defaultValue={week.odds ?? ''} placeholder="+45000" /></label>
          <label>To win<input name="payout" inputMode="decimal" defaultValue={week.payout ?? ''} placeholder="6300" /></label>
        </div>
        <button>Save ticket</button>
      </form>

      <h2>Scores</h2>
      <div className="panel">
        <SyncButton week={n} platform={settings.platform} />
        <form action={saveScores} className="panel" style={{ padding: 0 }}>
          <input type="hidden" name="week_id" value={week.id} />
          <p className="muted small">Fix or fill in scores by hand. Leave a box blank to clear it.</p>
          <div className="formgrid">
            {members.map((m) => (
              <label key={m.id}>
                {m.name}{scoreOf[m.id]?.source && scoreOf[m.id].source !== 'manual' ? ` (${scoreOf[m.id].source})` : ''}
                <input name={`score_${m.id}`} inputMode="decimal" defaultValue={scoreOf[m.id]?.points ?? ''} />
              </label>
            ))}
          </div>
          <button>Save scores</button>
        </form>
      </div>

      {n === settings.current_week && (
        <>
          <h2>Next week</h2>
          <form action={advanceWeek} className="panel">
            <p className="muted small">Opens week {n + 1} for picks. Week {n} stays in the history.</p>
            <button>Start week {n + 1}</button>
          </form>
        </>
      )}

      <h2>League settings</h2>
      <SettingsForm settings={settings} />

      <h2>Team matching</h2>
      <TeamMap members={members} platform={settings.platform} />

      <h2>PINs</h2>
      <div className="panel">
        <p className="muted small">Resetting a PIN lets that person choose a new one next time they log in.</p>
        <ul className="gradelist">
          {members.map((m) => (
            <li key={m.id} className="inline" style={{ justifyContent: 'space-between' }}>
              <span>{m.name} <span className="muted small">{m.has_pin ? 'PIN set' : 'No PIN yet'}</span></span>
              {m.has_pin && (
                <form action={resetPin}>
                  <input type="hidden" name="member_id" value={m.id} />
                  <button className="ghost">Reset PIN</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
