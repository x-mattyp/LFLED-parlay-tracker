'use client';

import { useActionState, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { reactToPick, addComment, deleteComment } from './actions';
import TeamLogo from './teamlogo';

const STAMP = { win: 'WIN', loss: 'LOSS', push: 'PUSH', pending: 'Pending' };

function Faces({ ids, people, max = 5 }) {
  if (!ids.length) return null;
  return (
    <span className="faces">
      {ids.slice(0, max).map((id) => (
        <span key={id} className="face" title={people[id]?.team_name || people[id]?.name}>
          <TeamLogo member={people[id] || { id, name: '?' }} size={20} className="face-logo" />
        </span>
      ))}
      {ids.length > max && <span className="face-more">+{ids.length - max}</span>}
    </span>
  );
}

function CommentForm({ weekId, pickMemberId }) {
  const [state, action, pending] = useActionState(addComment, null);
  const ref = useRef(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form action={action} ref={ref} className="pk-commentform">
      <input type="hidden" name="week_id" value={weekId} />
      <input type="hidden" name="pick_member_id" value={pickMemberId} />
      <input name="body" maxLength={500} placeholder="Write a comment…" aria-label="Write a comment" autoComplete="off" required />
      <button disabled={pending}>{pending ? '…' : 'Post'}</button>
      {state?.error && <p className="msg err" role="alert">{state.error}</p>}
    </form>
  );
}

function Row({ row, weekId, meId, isAdmin, people }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const { member: m, pick: p } = row;
  const [votes, setVote] = useOptimistic(
    { rides: row.rides, fades: row.fades },
    (cur, kind) => {
      const had = kind === 'ride' ? cur.rides.includes(meId) : cur.fades.includes(meId);
      const rides = cur.rides.filter((id) => id !== meId);
      const fades = cur.fades.filter((id) => id !== meId);
      if (!had) (kind === 'ride' ? rides : fades).push(meId);
      return { rides, fades };
    }
  );
  const mine = m.id === meId;
  const myVote = votes.rides.includes(meId) ? 'ride' : votes.fades.includes(meId) ? 'fade' : null;

  const vote = (kind) => {
    const fd = new FormData();
    fd.set('week_id', weekId);
    fd.set('pick_member_id', m.id);
    fd.set('kind', kind);
    startTransition(async () => {
      setVote(kind);
      await reactToPick(fd);
    });
  };

  return (
    <li className={`pk-row${mine ? ' mine' : ''}${open ? ' open' : ''}${p ? '' : ' nopick'}`}>
      <button type="button" className="pk-main" onClick={() => p && setOpen((v) => !v)} aria-expanded={open} disabled={!p}>
        <TeamLogo member={m} size={36} className="pk-logo" />
        <span className="pk-text">
          <span className="pk-team">
            {m.team_name || m.name}
            {mine && <span className="pk-you"> you</span>}
          </span>
          <span className="pk-bet">
            {p ? p.text : 'No pick yet'}
          </span>
          {p?.live && <span className={`pk-live ${p.live.state}`}>{p.live.text} · {p.live.clock}</span>}
          {p && (votes.rides.length > 0 || votes.fades.length > 0 || row.comments.length > 0) && (
            <span className="pk-tally">
              {votes.rides.length > 0 && <span className="t-ride">{votes.rides.length} riding</span>}
              {votes.fades.length > 0 && <span className="t-fade">{votes.fades.length} fading</span>}
              {row.comments.length > 0 && <span className="t-com">{row.comments.length} comment{row.comments.length === 1 ? '' : 's'}</span>}
            </span>
          )}
        </span>
        <span className="pk-side">
          {p && <span className={`stamp ${p.result}`}>{STAMP[p.result]}</span>}
        </span>
      </button>

      {p?.rationale && !open && (
        <span className="pk-pop" role="tooltip">
          <q>{p.rationale}</q>
          <span className="muted small">Tap to ride, fade or comment</span>
        </span>
      )}

      {open && p && (
        <div className="pk-panel">
          {p.rationale && <q className="pk-why">{p.rationale}</q>}

          <div className="pk-votes">
            {mine ? (
              <p className="muted small">Your pick. Everyone else can ride or fade it.</p>
            ) : (
              <>
                <button type="button" className={`vote ride${myVote === 'ride' ? ' on' : ''}`} onClick={() => vote('ride')} aria-pressed={myVote === 'ride'}>
                  Ride {votes.rides.length > 0 && <b>{votes.rides.length}</b>}
                </button>
                <button type="button" className={`vote fade${myVote === 'fade' ? ' on' : ''}`} onClick={() => vote('fade')} aria-pressed={myVote === 'fade'}>
                  Fade {votes.fades.length > 0 && <b>{votes.fades.length}</b>}
                </button>
              </>
            )}
          </div>
          {(votes.rides.length > 0 || votes.fades.length > 0) && (
            <div className="pk-who">
              {votes.rides.length > 0 && <span><span className="t-ride">Riding</span> <Faces ids={votes.rides} people={people} /></span>}
              {votes.fades.length > 0 && <span><span className="t-fade">Fading</span> <Faces ids={votes.fades} people={people} /></span>}
            </div>
          )}

          <ul className="pk-comments">
            {row.comments.map((c) => {
              const who = people[c.member_id] || { id: c.member_id, name: 'Someone' };
              return (
                <li key={c.id}>
                  <TeamLogo member={who} size={28} className="c-logo" />
                  <div className="c-bubble">
                    <b>{who.team_name || who.name}</b> <span className="muted small">{who.name} · {c.when}</span>
                    <p>{c.body}</p>
                  </div>
                  {(c.member_id === meId || isAdmin) && (
                    <form action={deleteComment} className="c-del">
                      <input type="hidden" name="comment_id" value={c.id} />
                      <button className="linkish small" title="Delete comment" aria-label="Delete comment">✕</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
          <CommentForm weekId={weekId} pickMemberId={m.id} />
        </div>
      )}
    </li>
  );
}

export default function PickList({ rows, weekId, meId, isAdmin, people }) {
  return (
    <ul className="pk-list">
      {rows.map((row) => (
        <Row key={row.member.id} row={row} weekId={weekId} meId={meId} isAdmin={isAdmin} people={people} />
      ))}
    </ul>
  );
}
