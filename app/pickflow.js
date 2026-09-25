'use client';

import { useState } from 'react';

// Before you pick: the matchup board comes first, everyone's picks below.
// After you pick: your pick up top with a button to reopen the board.
export default function PickFlow({ pickFirst, myPickLabel, canChange, board, slip }) {
  const [open, setOpen] = useState(false);

  if (pickFirst) {
    return (
      <>
        {board}
        <h2>Everyone&rsquo;s picks</h2>
        {slip}
      </>
    );
  }

  return (
    <>
      {myPickLabel && (
        <div className="mypickbar">
          <span>
            Your pick: <b>{myPickLabel}</b>
          </span>
          {canChange && (
            <button className="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? 'Keep my pick' : 'Change my pick'}
            </button>
          )}
        </div>
      )}
      {open && board}
      <h2>Everyone&rsquo;s picks</h2>
      {slip}
    </>
  );
}
