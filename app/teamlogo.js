'use client';

import { useState } from 'react';

// Team logo via the app's logo proxy; shows the team's initials if the
// image can't be loaded at all.
export default function TeamLogo({ member, size = 36, className = 'teamlogo' }) {
  const [broken, setBroken] = useState(false);
  const initials = (member.team_abbr || member.team_name || member.name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2);
  if (!member.team_logo || broken) {
    return (
      <span className={`${className} blank`} style={{ width: size, height: size }} aria-hidden="true">
        {initials}
      </span>
    );
  }
  const v = encodeURIComponent(member.team_logo.slice(-32));
  return (
    <img
      className={className}
      src={`/api/logo/${member.id}?v=${v}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}
