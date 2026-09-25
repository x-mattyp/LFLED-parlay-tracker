'use client';

import { useActionState, useEffect, useState } from 'react';
import { savePick } from './actions';

function Team({ game, side, selected, disabled, onPick }) {
  const t = game[side];
  const held = game.holder && game.holder.teamId === t.id;
  return (
    <button
      type="button"
      className={`team${selected ? ' selected' : ''}${held ? ' held' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => onPick(game.eventId, t.id)}
    >
      {t.logo && <img src={t.logo} alt="" width="28" height="28" />}
      <span className="tname">{t.name}</span>
      <span className="ml">{t.ml || '—'}</span>
      {game.started && t.score != null && <span className="score">{t.score}</span>}
    </button>
  );
}

export default function GameBoard({ weekId, locked, games, myPick }) {
  const [state, action, pending] = useActionState(savePick, null);
  const [sel, setSel] = useState(myPick ? { eventId: myPick.eventId, teamId: myPick.teamId } : null);

  // After a save or removal, snap the selection back to what's saved.
  useEffect(() => {
    setSel(myPick ? { eventId: myPick.eventId, teamId: myPick.teamId } : null);
  }, [myPick?.eventId, myPick?.teamId]);

  const myLocked = !!myPick?.started;
  const chosen = sel && games.find((g) => g.eventId === sel.eventId);
  const chosenTeam = chosen && (chosen.home.id === sel.teamId ? chosen.home : chosen.away);
  const isSaved = myPick && sel && myPick.eventId === sel.eventId && myPick.teamId === sel.teamId;

  return (
    <section className="gameboard">
      {locked && <p className="muted">Picks are locked for this week.</p>}
      {myLocked && <p className="muted">Your game has kicked off, so your pick is locked in.</p>}

      <ul className="games">
        {games.map((g) => {
          const takenByOther = g.holder && !g.holder.mine;
          const off = locked || myLocked || g.started || takenByOther;
          return (
            <li key={g.eventId} className={`game${g.started ? ' started' : ''}${takenByOther ? ' taken' : ''}`}>
              <div className="gmeta">
                <span>{g.label}</span>
                {g.holder && (
                  <span className={g.holder.mine ? 'mine-tag' : 'taken-tag'}>
                    {g.holder.mine ? 'Your pick' : `${g.holder.name} took ${g.holder.abbr}`}
                  </span>
                )}
              </div>
              <div className="teams">
                {['away', 'home'].map((side) => (
                  <Team
                    key={side}
                    game={g}
                    side={side}
                    selected={sel?.eventId === g.eventId && sel?.teamId === g[side].id}
                    disabled={off}
                    onPick={(eventId, teamId) => setSel({ eventId, teamId })}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {!locked && !myLocked && (
        <form action={action} className="pickform" key={sel ? `${sel.eventId}:${sel.teamId}` : 'none'}>
          <input type="hidden" name="week_id" value={weekId} />
          <input type="hidden" name="pick" value={sel ? `${sel.eventId}:${sel.teamId}` : ''} />
          {chosenTeam ? (
            <p className="pickline">
              <b>{chosenTeam.name}</b> to win {chosenTeam.ml ? <span className="muted">({chosenTeam.ml})</span> : null}
            </p>
          ) : (
            <p className="muted">Tap a team above to make your pick.</p>
          )}
          {chosenTeam && (
            <label>
              Why this pick? Everyone will see it.
              <textarea
                name="rationale"
                required
                minLength={10}
                maxLength={280}
                rows={3}
                defaultValue={isSaved ? myPick.rationale || '' : ''}
                placeholder="Their O-line is healthy again and the other side is on a short week."
              />
            </label>
          )}
          <div className="inline">
            {chosenTeam && (
              <button disabled={pending}>{pending ? 'Saving…' : myPick ? 'Update pick' : 'Lock in pick'}</button>
            )}
            {myPick && (
              <button className="ghost" name="intent" value="clear" formNoValidate disabled={pending}>
                Remove my pick
              </button>
            )}
          </div>
          {state?.error && <p className="msg err" role="alert">{state.error}</p>}
          {state?.ok && <p className="msg ok" role="status">{state.ok}</p>}
        </form>
      )}
    </section>
  );
}
