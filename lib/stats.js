// Pure helpers, safe on server or client.

// Everyone tied for the lowest score. Empty when no scores are in.
export function lowScorers(scores) {
  if (!scores.length) return [];
  const min = Math.min(...scores.map((s) => Number(s.points)));
  return scores.filter((s) => Number(s.points) === min).map((s) => s.member_id);
}

export function allScoresIn(scores, members) {
  return members.length > 0 && members.every((m) => scores.some((s) => s.member_id === m.id));
}

// A parlay loses on any losing leg, wins once every leg is graded with at
// least one win (pushes drop out), and is pending otherwise.
export function parlayResult(picks) {
  if (!picks.length) return 'pending';
  if (picks.some((p) => p.result === 'loss')) return 'loss';
  if (picks.some((p) => p.result === 'pending')) return 'pending';
  if (picks.some((p) => p.result === 'win')) return 'win';
  return 'push';
}

export function seasonStats({ weeks, scores, picks, members }) {
  const byMember = Object.fromEntries(
    members.map((m) => [m.id, { member: m, win: 0, loss: 0, push: 0, pending: 0, paid: 0, points: 0, weeksScored: 0 }])
  );

  for (const p of picks) {
    const s = byMember[p.member_id];
    if (s) s[p.result] += 1;
  }

  for (const sc of scores) {
    const s = byMember[sc.member_id];
    if (!s) continue;
    s.points += Number(sc.points);
    s.weeksScored += 1;
  }

  // Low scorer of week N buys week N+1, counted once the week is complete.
  const parlays = [];
  for (const w of weeks) {
    const ws = scores.filter((s) => s.week_id === w.id);
    if (allScoresIn(ws, members)) {
      for (const id of lowScorers(ws)) if (byMember[id]) byMember[id].paid += 1;
    }
    const wp = picks.filter((p) => p.week_id === w.id);
    parlays.push({ week: w, result: wp.length ? parlayResult(wp) : null });
  }

  const rows = Object.values(byMember).map((s) => {
    const graded = s.win + s.loss;
    return {
      ...s,
      pct: graded ? s.win / graded : null,
      avg: s.weeksScored ? s.points / s.weeksScored : null,
    };
  });
  rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.win - a.win || (a.member.team_name || a.member.name).localeCompare(b.member.team_name || b.member.name));

  const parlayRecord = { win: 0, loss: 0, push: 0 };
  for (const p of parlays) if (p.result && p.result !== 'pending') parlayRecord[p.result] += 1;

  return { rows, parlays, parlayRecord };
}
