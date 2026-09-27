'use client';

import { useActionState, useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { reactToPick, addComment, deleteComment } from './actions';
import TeamLogo from './teamlogo';

const STAMP = { win: 'WIN', loss: 'LOSS', push: 'PUSH', pending: 'Pending' };

function Faces({ ids, people, max = 5 }) {
  if (!ids.length) return null;
  return (
    <span className="faces">
      {ids.slice(0, max).map((id) => (
        <span key={id} className="face tipwrap" tabIndex={0}>
          <TeamLogo member={people[id] || { id, name: '?' }} size={20} className="face-logo" />
          <span className="tip" role="tooltip">
            <b>{people[id]?.team_name || people[id]?.name || 'Someone'}</b>
            {people[id]?.team_name && <span>{people[id].name}</span>}
          </span>
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

/* Bottom sheet: dims the feed instead of covering the next pick. */
function Sheet({ onClose, labelledBy, children }) {
  const panel = useRef(null);
  const opener = useRef(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [onClose]);

  return (
    <div className="sheet-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={panel} tabIndex={-1}>
        <span className="sheet-grab" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

function Row({ row, weekId, meId, isAdmin, people, open, onOpen, onClose }) {
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
  const titleId = `pk-title-${m.id}`;

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
    <li className={`pk-row${mine ? ' mine' : ''}${p ? '' : ' nopick'}`}>
      <button type="button" className="pk-main" onClick={() => p && onOpen()} disabled={!p}>
        <TeamLogo member={m} size={36} className="pk-logo" />
        <span className="pk-text">
          <span className="pk-team">
            {m.team_name || m.name}
            {mine && <span className="pk-you"> you</span>}
          </span>
          <span className="pk-bet">{p ? p.text : 'No pick yet'}</span>
          {p?.live && <span className={`pk-live ${p.live.state}`}>{p.live.text} · {p.live.clock}</span>}
        </span>
        <span className="pk-side">
          {p && <span className={`stamp ${p.result}`}>{STAMP[p.result]}</span>}
        </span>
      </button>

      {p && (
        <div className="pk-quick">
          {mine ? (
            <span className="pk-mine small">
              {votes.rides.length > 0 && <span className="t-ride">{votes.rides.length} riding</span>}
              {votes.fades.length > 0 && <span className="t-fade">{votes.fades.length} fading</span>}
              {!votes.rides.length && !votes.fades.length && <span className="muted">No rides or fades yet</span>}
            </span>
          ) : (
            <>
              <button type="button" className={`qv ride${myVote === 'ride' ? ' on' : ''}`} onClick={() => vote('ride')} aria-pressed={myVote === 'ride'}>
                Ride{votes.rides.length > 0 && <b>{votes.rides.length}</b>}
              </button>
              <button type="button" className={`qv fade${myVote === 'fade' ? ' on' : ''}`} onClick={() => vote('fade')} aria-pressed={myVote === 'fade'}>
                Fade{votes.fades.length > 0 && <b>{votes.fades.length}</b>}
              </button>
            </>
          )}
          <button type="button" className="qv talk" onClick={onOpen}>
            💬{row.comments.length > 0 ? <b>{row.comments.length}</b> : <span className="qv-label">Comment</span>}
          </button>
        </div>
      )}

      {open && p && (
        <Sheet onClose={onClose} labelledBy={titleId}>
          <div className="sheet-head">
            <TeamLogo member={m} size={42} className="pk-logo" />
            <span className="sheet-who">
              <b id={titleId}>{m.team_name || m.name}</b>
              <span className="muted small">{m.team_name ? m.name : 'Their pick'}{mine ? ' · you' : ''}</span>
            </span>
            <button type="button" className="sheet-x" onClick={onClose} aria-label="Close">✕</button>
          </div>

          <div className="sheet-bet">
            <span className="sheet-bet-text">{p.text}</span>
            <span className={`stamp ${p.result}`}>{STAMP[p.result]}</span>
          </div>
          {p.live && <p className={`pk-live ${p.live.state} sheet-live`}>{p.live.text} · {p.live.clock}</p>}

          <div className="sheet-body">
            {p.rationale ? (
              <div className="sheet-why">
                <span className="sheet-label">{mine ? 'Your reasoning' : 'Why they like it'}</span>
                <q className="pk-why">{p.rationale}</q>
              </div>
            ) : (
              <p className="muted small sheet-why-none">No reasoning given.</p>
            )}

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

          {!mine && (
            <div className="sheet-actions">
              <button type="button" className={`vote ride${myVote === 'ride' ? ' on' : ''}`} onClick={() => vote('ride')} aria-pressed={myVote === 'ride'}>
                Ride it{votes.rides.length > 0 && <b>{votes.rides.length}</b>}
              </button>
              <button type="button" className={`vote fade${myVote === 'fade' ? ' on' : ''}`} onClick={() => vote('fade')} aria-pressed={myVote === 'fade'}>
                Fade it{votes.fades.length > 0 && <b>{votes.fades.length}</b>}
              </button>
            </div>
          )}
        </Sheet>
      )}
    </li>
  );
}

export default function PickList({ rows, weekId, meId, isAdmin, people }) {
  const [openId, setOpenId] = useState(null);
  const close = useCallback(() => setOpenId(null), []);

  return (
    <ul className="pk-list">
      {rows.map((row) => (
        <Row
          key={row.member.id}
          row={row}
          weekId={weekId}
          meId={meId}
          isAdmin={isAdmin}
          people={people}
          open={openId === row.member.id}
          onOpen={() => setOpenId(row.member.id)}
          onClose={close}
        />
      ))}
    </ul>
  );
}
