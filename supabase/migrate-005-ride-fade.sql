-- Run once in Supabase -> SQL Editor. Ride/fade votes and comments on picks.
create table if not exists reactions (
  week_id bigint not null references weeks(id) on delete cascade,
  pick_member_id bigint not null references members(id) on delete cascade,  -- whose pick
  member_id bigint not null references members(id) on delete cascade,       -- who reacted
  kind text not null check (kind in ('ride', 'fade')),
  created_at timestamptz not null default now(),
  primary key (week_id, pick_member_id, member_id)
);

create table if not exists comments (
  id bigint generated always as identity primary key,
  week_id bigint not null references weeks(id) on delete cascade,
  pick_member_id bigint not null references members(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists comments_pick on comments (week_id, pick_member_id, created_at);

alter table reactions enable row level security;
alter table comments enable row level security;
