// Matches league members to their fantasy teams using the owner names the
// platform returns, so nobody has to pair them by hand. Pure logic, no I/O.

// League nicknames that don't look like the owner's real name.
const ALIASES = {
  'big mike': ['hoeing'],
  berg: ['forsberg'],
  duce: ['flaherty'],
  terry: ['terence', 'crowe'],
  cal: ['callahan', 'inlow'],
  pat: ['patrick', 'bohen'],
  matty: ['pontikes'],
  tony: ['sanchez'],
  will: ['meyer'],
  reed: ['nation'],
  jack: ['knepper'],
  ian: ['browchuk'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function words(team) {
  const owners = team.owners.map(norm);
  return {
    owners,
    first: owners.map((o) => o.split(' ')[0]),
    last: owners.map((o) => o.split(' ').slice(-1)[0]),
    all: owners.join(' ').split(' '),
    abbrev: norm(team.abbrev),
    name: norm(team.name),
  };
}

// Higher score = stronger match. 0 = no match.
function score(member, team) {
  const n = norm(member.name);
  const w = words(team);
  const aliases = ALIASES[n] || [];
  if (aliases.some((a) => w.all.includes(a))) return 100;
  if (w.last.includes(n)) return 90; // "Morelli" -> Michael Morelli
  if (w.owners.includes(n)) return 90;
  if (w.first.includes(n)) return 70; // "Ian" -> Ian Browchuk
  if (w.abbrev && w.abbrev === n) return 60; // "REED", "Berg"
  if (n.length >= 3 && w.first.some((f) => f.startsWith(n) || n.startsWith(f))) return 40; // Cal/Callahan, Matty/Matt
  if (n.length >= 4 && w.name.split(' ').includes(n)) return 30; // "Black Out Berg"
  return 0;
}

// Returns { memberId: team } for as many members as can be matched.
// Existing links are kept when that team still exists; strongest matches are
// taken first; if exactly one person and one team are left, they're paired.
export function matchTeams(members, teams) {
  const out = {};
  const taken = new Set();
  for (const m of members) {
    const t = m.external_team_id && teams.find((x) => x.id === m.external_team_id);
    if (t && !taken.has(t.id)) { out[m.id] = t; taken.add(t.id); }
  }
  const pairs = [];
  for (const m of members) {
    if (out[m.id]) continue;
    for (const t of teams) {
      if (taken.has(t.id)) continue;
      const s = score(m, t);
      if (s) pairs.push({ m, t, s });
    }
  }
  pairs.sort((a, b) => b.s - a.s);
  for (const { m, t } of pairs) {
    if (out[m.id] || taken.has(t.id)) continue;
    out[m.id] = t;
    taken.add(t.id);
  }
  const leftM = members.filter((m) => !out[m.id]);
  const leftT = teams.filter((t) => !taken.has(t.id));
  if (leftM.length === 1 && leftT.length === 1) out[leftM[0].id] = leftT[0];
  return out;
}

// What to show for a member everywhere in the app.
export const label = (m) => (m ? m.team_name || m.name : 'Someone');
