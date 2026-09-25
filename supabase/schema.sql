-- LFLED Picks Pool schema. Paste into Supabase -> SQL Editor -> Run.

create table members (
  id bigint generated always as identity primary key,
  name text not null unique,
  pin_hash text,                       -- bcrypt hash; null until first login
  is_admin boolean not null default false,
  external_team_id text,               -- ESPN team id or Sleeper roster id
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table settings (
  id int primary key default 1 check (id = 1),
  season int not null default 2026,
  current_week int not null default 1,
  platform text not null default 'manual' check (platform in ('manual', 'espn', 'sleeper')),
  league_id text
);

create table weeks (
  id bigint generated always as identity primary key,
  season int not null,
  week int not null,
  locked boolean not null default false,
  stake numeric(10,2),
  odds text,
  payout numeric(10,2),
  unique (season, week)
);

create table scores (
  week_id bigint not null references weeks(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  points numeric(7,2) not null,
  source text not null default 'manual',
  updated_at timestamptz not null default now(),
  primary key (week_id, member_id)
);

create table picks (
  week_id bigint not null references weeks(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  bet text not null,
  odds text,
  result text not null default 'pending' check (result in ('pending', 'win', 'loss', 'push')),
  updated_at timestamptz not null default now(),
  primary key (week_id, member_id)
);

-- Lock every table down. The app talks to the database only from the server
-- with the service-role key, so nobody can read PIN hashes or edit picks
-- directly with the public anon key.
alter table members  enable row level security;
alter table settings enable row level security;
alter table weeks    enable row level security;
alter table scores   enable row level security;
alter table picks    enable row level security;

insert into settings (season, current_week) values (2026, 1);

insert into members (name, is_admin) values
  ('Berg', false), ('Big Mike', false), ('Cal', false), ('Duce', false),
  ('Ian', false), ('Jack', false), ('Matty', true), ('Morelli', false),
  ('Murray', false), ('Pat', false), ('Reed', false), ('Terry', false),
  ('Tony', false), ('Will', false);
