'use client';

import { useActionState, useState, useTransition } from 'react';
import { syncScores, saveSettings, loadTeams, saveTeamMap, refreshTeams, commishPick } from '../actions';

function Msg({ state }) {
  if (!state) return null;
  return state.error
    ? <p className="msg err" role="alert">{state.error}</p>
    : <p className="msg ok" role="status">{state.ok}</p>;
}

export function SyncButton({ week, platform }) {
  const [state, action, pending] = useActionState(syncScores, null);
  if (platform === 'manual') return <p className="muted small">Score sync is off. Choose ESPN or Sleeper in league settings to turn it on.</p>;
  return (
    <form action={action} className="inline">
      <input type="hidden" name="week" value={week} />
      <button disabled={pending}>{pending ? 'Pulling scores…' : `Pull week ${week} scores from ${platform === 'espn' ? 'ESPN' : 'Sleeper'}`}</button>
      <Msg state={state} />
    </form>
  );
}

export function SettingsForm({ settings }) {
  const [state, action, pending] = useActionState(saveSettings, null);
  return (
    <form action={action} className="panel">
      <div className="formgrid">
        <label>Season<input name="season" type="number" defaultValue={settings.season} required /></label>
        <label>Current week<input name="current_week" type="number" min="1" max="22" defaultValue={settings.current_week} required /></label>
        <label>
          Fantasy platform
          <select name="platform" defaultValue={settings.platform}>
            <option value="manual">Enter scores by hand</option>
            <option value="espn">ESPN</option>
            <option value="sleeper">Sleeper</option>
          </select>
        </label>
        <label>League ID<input name="league_id" defaultValue={settings.league_id || ''} placeholder="From your league URL" /></label>
      </div>
      <button disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</button>
      <Msg state={state} />
    </form>
  );
}

// Teams link to people automatically from the league's owner names.
// The manual picker is tucked away for the rare wrong match.
export function TeamLinks({ members, platform }) {
  const [state, setState] = useState(null);
  const [pending, start] = useTransition();
  const [teams, setTeams] = useState(null);
  const [saveState, saveAction, saving] = useActionState(saveTeamMap, null);
  if (platform === 'manual') return <p className="muted small">Choose ESPN or Sleeper in league settings to link teams.</p>;

  const relink = () => start(async () => setState(await refreshTeams()));
  const openFix = () => start(async () => {
    const res = await loadTeams();
    if (res.error) setState({ error: res.error });
    else setTeams(res.teams);
  });
  const unlinked = members.filter((m) => !m.external_team_id);

  return (
    <div className="panel">
      <p className="muted small">
        Everyone is linked to their team automatically from the owner names on {platform === 'espn' ? 'ESPN' : 'Sleeper'}, and
        team names refresh every morning.
      </p>
      <ul className="teamlist">
        {members.map((m) => (
          <li key={m.id}>
            {m.team_logo ? <img src={m.team_logo} alt="" width="28" height="28" /> : <span className="logo-blank" aria-hidden="true" />}
            <span>
              <b>{m.team_name || 'Not linked yet'}</b>
              <span className="muted small"> {m.name}{m.team_owner ? ` (${m.team_owner})` : ''}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="inline">
        <button className={unlinked.length ? '' : 'ghost'} onClick={relink} disabled={pending}>
          {pending ? 'Linking…' : unlinked.length ? 'Link teams from the league' : 'Refresh teams now'}
        </button>
      </div>
      <Msg state={state} />
      {!teams ? (
        <p className="small">
          <button className="linkish" onClick={openFix} disabled={pending}>Wrong match? Fix it by hand</button>
        </p>
      ) : (
        <form action={saveAction} className="panel" style={{ padding: 0 }}>
          <div className="formgrid">
            {members.map((m) => (
              <label key={m.id}>
                {m.name}
                <select name={`team_${m.id}`} defaultValue={m.external_team_id || ''}>
                  <option value="">Not linked</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.owners?.length ? ` (${t.owners.join(', ')})` : ''}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <button disabled={saving}>{saving ? 'Saving…' : 'Save team matches'}</button>
          <Msg state={saveState} />
        </form>
      )}
    </div>
  );
}

// Place or remove a pick on someone's behalf. Games already taken by
// someone else are disabled; the commissioner isn't held to kickoff locks.
export function CommishPickForm({ weekId, members, games, picks }) {
  const [state, action, pending] = useActionState(commishPick, null);
  const [memberId, setMemberId] = useState('');
  const holderOf = Object.fromEntries(picks.map((p) => [p.event_id, p.member_id]));
  const labelOf = Object.fromEntries(members.map((m) => [m.id, m.team_name || m.name]));
  const current = picks.find((p) => String(p.member_id) === memberId);

  return (
    <form action={action} className="panel" key={state?.ok || 'form'}>
      <input type="hidden" name="week_id" value={weekId} />
      <p className="muted small">
        Enter a pick someone sent you. It works even after kickoff or when picks are locked, but a game someone else already
        has stays off limits.
      </p>
      <label>
        Pick for
        <select name="member_id" value={memberId} onChange={(e) => setMemberId(e.target.value)} required>
          <option value="" disabled>Choose a team</option>
          {members.map((m) => {
            const has = picks.some((p) => p.member_id === m.id);
            return <option key={m.id} value={m.id}>{labelOf[m.id]} ({m.name}){has ? ' · has a pick' : ''}</option>;
          })}
        </select>
      </label>
      {current && (
        <p className="small">
          Current pick: <b>{current.team_name ? `${current.team_name} ML` : current.bet}</b>. Saving a new one replaces it.
        </p>
      )}
      <label>
        Team to win
        <select name="pick" defaultValue="" required>
          <option value="" disabled>Choose a team</option>
          {games.map((g) => {
            const holder = holderOf[g.event_id];
            const blocked = holder && String(holder) !== memberId;
            const suffix = blocked ? ` · taken by ${labelOf[holder]}` : '';
            return (
              <optgroup key={g.event_id} label={`${g.away_abbr} @ ${g.home_abbr}${suffix}`}>
                <option value={`${g.event_id}:${g.away_id}`} disabled={blocked}>
                  {g.away_name}{g.away_ml ? ` (${g.away_ml})` : ''}
                </option>
                <option value={`${g.event_id}:${g.home_id}`} disabled={blocked}>
                  {g.home_name}{g.home_ml ? ` (${g.home_ml})` : ''}
                </option>
              </optgroup>
            );
          })}
        </select>
      </label>
      <label>
        Their reason (optional)
        <textarea name="rationale" rows={2} maxLength={280} placeholder="What they told you" />
      </label>
      <div className="inline">
        <button disabled={pending || !memberId}>{pending ? 'Saving…' : 'Save pick'}</button>
        {current && (
          <button className="ghost" name="intent" value="clear" formNoValidate disabled={pending}>
            Remove their pick
          </button>
        )}
      </div>
      <Msg state={state} />
    </form>
  );
}
