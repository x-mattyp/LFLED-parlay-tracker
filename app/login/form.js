'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { login, pinStatus } from '../actions';
import TeamLogo from '../teamlogo';

const digitsOnly = (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); };

export default function LoginForm({ people }) {
  const [state, action, pending] = useActionState(login, null);
  const [who, setWho] = useState(null);
  const [hasPin, setHasPin] = useState(null);
  const [, startTransition] = useTransition();
  const pinRef = useRef(null);

  useEffect(() => {
    setHasPin(null);
    if (!who) return;
    startTransition(async () => setHasPin((await pinStatus(who.name)).hasPin));
  }, [who]);

  useEffect(() => {
    if (who && hasPin !== null) pinRef.current?.focus();
  }, [who, hasPin]);

  if (!who) {
    return (
      <ul className="teampick">
        {people.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setWho(p)}>
              <TeamLogo member={p} size={72} className="tp-logo" />
              <span className="tp-team">{p.team_name || p.name}</span>
              <span className="tp-name">{p.name}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  const settingPin = hasPin === false || state?.needsConfirm;

  return (
    <form action={action} className="panel pinpanel">
      <input type="hidden" name="name" value={who.name} />
      <div className="pp-who">
        <TeamLogo member={who} size={64} className="tp-logo" />
        <div>
          <b>{who.team_name || who.name}</b>
          <span className="muted small">{who.name}</span>
        </div>
      </div>
      {hasPin === null ? (
        <p className="muted small">One sec…</p>
      ) : (
        <>
          <label>
            {settingPin ? 'Choose a 4-digit PIN' : 'PIN'}
            <input ref={pinRef} name="pin" type="password" inputMode="numeric"
              autoComplete={settingPin ? 'new-password' : 'current-password'}
              pattern="\d{4}" minLength={4} maxLength={4} onInput={digitsOnly} required />
          </label>
          {settingPin && (
            <label>
              Type it again
              <input name="confirm" type="password" inputMode="numeric" autoComplete="new-password"
                pattern="\d{4}" minLength={4} maxLength={4} onInput={digitsOnly} required />
            </label>
          )}
          {state?.error && <p className="msg err" role="alert">{state.error}</p>}
          <button disabled={pending}>{pending ? 'Checking…' : settingPin ? 'Set PIN and log in' : 'Log in'}</button>
        </>
      )}
      <button type="button" className="linkish" onClick={() => setWho(null)}>Not you? Pick another team</button>
    </form>
  );
}
