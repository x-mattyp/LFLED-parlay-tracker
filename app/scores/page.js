import Link from 'next/link';
import { requireMember } from '@/lib/session';
import { getSettings, getWeekBundle } from '@/lib/data';
import { fetchScoreboard } from '@/lib/nfl';
import LiveRefresh from '../liverefresh';
import TeamLogo from '../teamlogo';

const kickoffFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit',
});
const dayFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric' });

function TeamRow({ t, g, picks, meId }) {
  const hasBall = g.state === 'in' && g.possession === t.id;
  const lost = g.completed && !t.winner && (g.home.winner || g.away.winner);
  return (
    <div className={`sb-team${lost ? ' lost' : ''}${t.winner ? ' won' : ''}`}>
      {t.logo ? <img src={t.logo} alt="" width="32" height="32" /> : <span className="sb-nologo" />}
      <span className="sb-name">
        <b>{t.short}</b>
        {t.record && <span className="muted small"> {t.record}</span>}
        {hasBall && <span className="ball" title="Has the ball" aria-label="Has the ball">●</span>}
      </span>
      <span className="sb-pickers">
        {picks.map((p) => (
          <span key={p.member.id} className={`picker tipwrap${p.member.id === meId ? ' me' : ''} ${p.result}`} tabIndex={0}>
            <TeamLogo member={p.member} size={22} className="picker-logo" />
            <span className="tip" role="tooltip">
              <b>{p.member.team_name || p.member.name}</b>
              <span>{p.member.name} picked {t.short}</span>
            </span>
          </span>
        ))}
      </span>
      <span className="sb-score">{g.state === 'pre' ? '' : t.score ?? ''}</span>
    </div>
  );
}

export default async function ScoresPage({ searchParams }) {
  const me = await requireMember();
  const settings = await getSettings();
  const sp = await searchParams;
  const current = settings.current_week;
  const n = Math.min(Math.max(Number(sp.week) || current, 1), 18);

  let games = [];
  let error = null;
  try {
    games = await fetchScoreboard(settings.season, n);
  } catch (e) {
    error = e.message;
  }
  const { members, picks } = await getWeekBundle(settings.season, Math.min(n, current));
  const memberOf = Object.fromEntries(members.map((m) => [m.id, m]));
  const picksFor = (eventId, teamId) =>
    n <= current
      ? picks.filter((p) => p.event_id === eventId && p.team_id === teamId).map((p) => ({ ...p, member: memberOf[p.member_id] })).filter((p) => p.member)
      : [];

  const live = games.filter((g) => g.state === 'in');
  const upcoming = games.filter((g) => g.state === 'pre').sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const final = games.filter((g) => g.state === 'post').sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));

  // Group upcoming games by day so Sunday's slate reads like a TV guide.
  const byDay = [];
  for (const g of upcoming) {
    const d = dayFmt.format(new Date(g.kickoff));
    const last = byDay[byDay.length - 1];
    if (last && last.day === d) last.games.push(g);
    else byDay.push({ day: d, games: [g] });
  }

  const card = (g) => {
    const leaguePicked = picksFor(g.id, g.away.id).length + picksFor(g.id, g.home.id).length > 0;
    return (
      <li key={g.id} className={`sb-game ${g.state}${g.redZone ? ' redzone' : ''}${leaguePicked ? ' picked' : ''}`}>
        <div className="sb-head">
          <span className={g.state === 'in' ? 'sb-live' : 'muted small'}>
            {g.state === 'pre' ? `${kickoffFmt.format(new Date(g.kickoff))} ET` : g.detail}
          </span>
          <span className="muted small">
            {g.state === 'pre' ? [g.tv, g.odds].filter(Boolean).join(' · ') : g.state === 'in' ? g.tv || '' : ''}
          </span>
        </div>
        <TeamRow t={g.away} g={g} picks={picksFor(g.id, g.away.id)} meId={me.id} />
        <TeamRow t={g.home} g={g} picks={picksFor(g.id, g.home.id)} meId={me.id} />
        {g.state === 'in' && (g.downDistance || g.lastPlay) && (
          <div className="sb-situation">
            {g.downDistance && <b>{g.redZone ? 'Red zone · ' : ''}{g.downDistance}</b>}
            {g.lastPlay && <span className="muted small">{g.lastPlay}</span>}
          </div>
        )}
        <a className="sb-link small" href={g.link} target="_blank" rel="noreferrer">
          {g.state === 'in' ? 'Watch on ESPN Gamecast' : g.state === 'post' ? 'Box score on ESPN' : 'Preview on ESPN'}
        </a>
      </li>
    );
  };

  return (
    <>
      {live.length > 0 && <LiveRefresh seconds={30} />}
      <div className="weekhead">
        <div>
          <p className="muted small">NFL scores</p>
          <h1>Week {n}</h1>
        </div>
        <div className="arrows">
          <Link className="arrow" href={`/scores?week=${n - 1}`} aria-disabled={n <= 1} aria-label="Previous week">‹</Link>
          <Link className="arrow" href={`/scores?week=${n + 1}`} aria-disabled={n >= 18} aria-label="Next week">›</Link>
        </div>
      </div>

      {error && <p className="msg err">Couldn&rsquo;t load scores from ESPN right now. Try again in a minute.</p>}
      {!error && !games.length && <p className="muted">No games on the schedule for week {n}.</p>}

      {live.length > 0 && (
        <>
          <h2><span className="livebadge">Live</span> In progress</h2>
          <ul className="sb-list">{live.map(card)}</ul>
          <p className="muted small">Updates every 30 seconds while games are on.</p>
        </>
      )}
      {byDay.map(({ day, games: gs }) => (
        <section key={day}>
          <h2>{day}</h2>
          <ul className="sb-list">{gs.map(card)}</ul>
        </section>
      ))}
      {final.length > 0 && (
        <>
          <h2>Final</h2>
          <ul className="sb-list">{final.map(card)}</ul>
        </>
      )}
    </>
  );
}
