'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { login, pinStatus } from '../actions';

const digitsOnly = (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); };

export default function LoginForm({ people }) {
  const [state, action, pending] = useActionState(login, null);
  const [name, setName] = useState('');
  const [hasPin, setHasPin] = useState(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!name) { setHasPin(null); return; }
    startTransition(async () => setHasPin((await pinStatus(name)).hasPin));
  }, [name]);

  const settingPin = hasPin === false || state?.needsConfirm;

  return (
    <form action={action} className="panel">
      <label>
        Name
        <select name="name" value={name} onChange={(e) => setName(e.target.value)} required>
          <option value="" disabled>Choose your name</option>
          {people.map((p) => <option key={p.name} value={p.name}>{p.team ? `${p.name} (${p.team})` : p.name}</option>)}
        </select>
      </label>
      <label>
        {settingPin ? 'Choose a PIN' : 'PIN'}
        <input name="pin" type="password" inputMode="numeric" autoComplete={settingPin ? 'new-password' : 'current-password'}
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
      <button disabled={pending || !name}>{pending ? 'Checking…' : settingPin ? 'Set PIN and log in' : 'Log in'}</button>
    </form>
  );
}
