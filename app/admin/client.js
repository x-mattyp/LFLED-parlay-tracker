'use client';

import { useActionState, useState, useTransition } from 'react';
import { syncScores, saveSettings, loadTeams, saveTeamMap } from '../actions';

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

export function TeamMap({ members, platform }) {
  const [teams, setTeams] = useState(null);
  const [error, setError] = useState(null);
  const [pending, start] = useTransition();
  if (platform === 'manual') return <p className="muted small">Pick a platform in league settings first.</p>;

  const load = () => start(async () => {
    const res = await loadTeams();
    setError(res.error || null);
    setTeams(res.teams || null);
  });

  if (!teams) {
    return (
      <div className="panel">
        <p className="muted small">Match each person to their fantasy team so synced scores land on the right name.</p>
        <button className="ghost" onClick={load} disabled={pending}>{pending ? 'Loading teams…' : 'Load league teams'}</button>
        {error && <p className="msg err" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form action={saveTeamMap} className="panel">
      <div className="formgrid">
        {members.map((m) => (
          <label key={m.id}>
            {m.name}
            <select name={`team_${m.id}`} defaultValue={m.external_team_id || ''}>
              <option value="">Not matched</option>
              {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        ))}
      </div>
      <button>Save team matches</button>
    </form>
  );
}
