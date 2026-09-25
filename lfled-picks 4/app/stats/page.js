import { requireMember } from '@/lib/session';
import { getSettings, getSeason } from '@/lib/data';
import { seasonStats } from '@/lib/stats';

const MARK = { win: 'W', loss: 'L', push: 'P', pending: '·' };

export default async function StatsPage() {
  await requireMember();
  const settings = await getSettings();
  const season = await getSeason(settings.season);
  const { rows, parlays, parlayRecord } = seasonStats(season);
  const { weeks, picks } = season;
  const pickAt = new Map(picks.map((p) => [`${p.week_id}:${p.member_id}`, p]));

  return (
    <>
      <div className="weekhead">
        <div>
          <p className="muted small">Season stats</p>
          <h1>{settings.season}</h1>
        </div>
      </div>

      <div className="buyer quiet">
        The group parlay is {parlayRecord.win}–{parlayRecord.loss}
        {parlayRecord.push ? `–${parlayRecord.push}` : ''} this season.
      </div>

      <h2>Pick records</h2>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              <th>Player</th><th>W</th><th>L</th><th>P</th><th>Win %</th><th>Times bought</th><th>Avg score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.member.id}>
                <td>{r.member.name}</td>
                <td className="w">{r.win}</td>
                <td className="l">{r.loss}</td>
                <td>{r.push}</td>
                <td>{r.pct == null ? '—' : `${Math.round(r.pct * 100)}%`}</td>
                <td>{r.paid}</td>
                <td>{r.avg == null ? '—' : r.avg.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">&ldquo;Times bought&rdquo; counts each week someone finished with the lowest fantasy score.</p>

      <h2>Week by week</h2>
      {weeks.length ? (
        <div className="tablewrap">
          <table className="grid">
            <thead>
              <tr>
                <th>Player</th>
                {weeks.map((w) => <th key={w.id}>{w.week}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.member.id}>
                  <td>{r.member.name}</td>
                  {weeks.map((w) => {
                    const p = pickAt.get(`${w.id}:${r.member.id}`);
                    const res = p?.result;
                    return (
                      <td key={w.id} className={res === 'win' ? 'w' : res === 'loss' ? 'l' : ''} title={p?.bet || 'No pick'}>
                        {p ? MARK[res] : '–'}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td><b>Parlay</b></td>
                {parlays.map(({ week, result }) => (
                  <td key={week.id} className={result === 'win' ? 'w' : result === 'loss' ? 'l' : ''}>
                    {result ? MARK[result] : '–'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No weeks played yet.</p>
      )}
    </>
  );
}
