'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
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
  const [sel, setSel] = useState(null);
  const dialogRef = useRef(null);

  const myLocked = !!myPick?.started;
  const chosen = sel && games.find((g) => g.eventId === sel.eventId);
  const chosenTeam = chosen && (chosen.home.id === sel.teamId ? chosen.home : chosen.away);
  const otherTeam = chosen && (chosen.home.id === sel.teamId ? chosen.away : chosen.home);
  const isSaved = myPick && sel && myPick.eventId === sel.eventId && myPick.teamId === sel.teamId;

  const open = (eventId, teamId) => {
    setSel({ eventId, teamId });
    dialogRef.current?.showModal();
  };
  const close = () => dialogRef.current?.close();

  // Close the pop-up once a save goes through.
  useEffect(() => {
    if (state?.ok) close();
  }, [state]);

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
                    selected={myPick?.eventId === g.eventId && myPick?.teamId === g[side].id}
                    disabled={off}
                    onPick={open}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <dialog ref={dialogRef} className="pickmodal" onClose={() => setSel(null)} aria-labelledby="pickmodal-title">
        {chosenTeam && (
          <form action={action} key={`${sel.eventId}:${sel.teamId}`}>
            <input type="hidden" name="week_id" value={weekId} />
            <input type="hidden" name="pick" value={`${sel.eventId}:${sel.teamId}`} />
            <div className="pm-head">
              {chosenTeam.logo && <img src={chosenTeam.logo} alt="" width="48" height="48" />}
              <div>
                <p className="muted small">{isSaved ? 'Your pick' : myPick ? 'Switch your pick to' : 'Your pick'}</p>
                <h3 id="pickmodal-title">{chosenTeam.name} to win</h3>
                <p className="muted small">
                  {chosenTeam.ml ? `${chosenTeam.ml} moneyline · ` : ''}
                  {chosen.home.id === sel.teamId ? 'vs' : '@'} {otherTeam.name}
                </p>
              </div>
            </div>
            <label>
              Why this pick? Everyone will see it.
              <textarea
                name="rationale"
                required
                minLength={10}
                maxLength={280}
                rows={3}
                autoFocus
                defaultValue={isSaved ? myPick.rationale || '' : ''}
                placeholder="Their O-line is healthy again and the other side is on a short week."
              />
            </label>
            {state?.error && <p className="msg err" role="alert">{state.error}</p>}
            <div className="pm-actions">
              <button disabled={pending}>{pending ? 'Saving…' : isSaved ? 'Update reason' : myPick ? 'Switch pick' : 'Lock in pick'}</button>
              <button type="button" className="ghost" onClick={close} disabled={pending}>Cancel</button>
              {myPick && (
                <button className="linkish pm-remove" name="intent" value="clear" formNoValidate disabled={pending}>
                  Remove my pick
                </button>
              )}
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
