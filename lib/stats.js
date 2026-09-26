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

export const DEFAULT_STAKE = 14;

// American odds ("-150", "+120") -> decimal odds (2.2 means $1 returns $2.20).
export function toDecimal(american) {
  const n = Number(String(american ?? '').replace(/[^0-9.+-]/g, ''));
  if (!n || Math.abs(n) < 100) return null;
  return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
}

export function toAmerican(decimal) {
  if (!decimal || decimal <= 1) return null;
  const v = decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
  return v > 0 ? `+${v.toLocaleString()}` : v.toLocaleString();
}

// Estimated parlay price from each leg's saved odds. Pushed legs drop out,
// as they would at a sportsbook. Legs with no odds are counted separately so
// the page can say the estimate is partial.
export function estimateParlay(picks, stake = DEFAULT_STAKE) {
  let dec = 1;
  let priced = 0;
  let unpriced = 0;
  for (const p of picks) {
    if (p.result === 'push') continue;
    const d = toDecimal(p.odds);
    if (d) { dec *= d; priced += 1; } else unpriced += 1;
  }
  if (!priced) return null;
  return {
    decimal: dec,
    american: toAmerican(dec),
    payout: stake * dec,
    toWin: stake * (dec - 1),
    priced,
    unpriced,
  };
}

// How good each person is at riding and fading. A ride is right when that
// pick wins; a fade is right when it loses. Pushes and ungraded picks don't
// count. Also tallies how often each person's own picks got ridden or faded.
export function rideFadeStats({ reactions = [], picks, members }) {
  const pickAt = new Map(picks.map((p) => [`${p.week_id}:${p.member_id}`, p]));
  const by = Object.fromEntries(
    members.map((m) => [m.id, { member: m, rideW: 0, rideL: 0, fadeW: 0, fadeL: 0, pending: 0, gotRides: 0, gotFades: 0 }])
  );
  for (const r of reactions) {
    const voter = by[r.member_id];
    const target = by[r.pick_member_id];
    if (target) target[r.kind === 'ride' ? 'gotRides' : 'gotFades'] += 1;
    if (!voter) continue;
    const p = pickAt.get(`${r.week_id}:${r.pick_member_id}`);
    if (!p || p.result === 'push') continue;
    if (p.result === 'pending') { voter.pending += 1; continue; }
    if (r.kind === 'ride') voter[p.result === 'win' ? 'rideW' : 'rideL'] += 1;
    else voter[p.result === 'loss' ? 'fadeW' : 'fadeL'] += 1;
  }
  const rows = Object.values(by).map((s) => {
    const right = s.rideW + s.fadeW;
    const wrong = s.rideL + s.fadeL;
    return { ...s, right, wrong, pct: right + wrong ? right / (right + wrong) : null };
  });
  rows.sort(
    (a, b) =>
      (b.pct ?? -1) - (a.pct ?? -1) ||
      b.right - a.right ||
      (a.member.team_name || a.member.name).localeCompare(b.member.team_name || b.member.name)
  );
  return rows;
}
