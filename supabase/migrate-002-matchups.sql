-- Run once in Supabase -> SQL Editor (after schema.sql).
-- Adds NFL matchups, moneyline picks with a rationale, and keeps weeks 1-2
-- as commissioner-entered free-text picks.

create table games (
  event_id text primary key,            -- ESPN NFL event id
  season int not null,
  week int not null,
  kickoff timestamptz not null,
  state text not null default 'pre',    -- pre | in | post
  status_detail text,
  completed boolean not null default false,
  home_id text not null, home_abbr text not null, home_name text not null, home_logo text, home_score int, home_ml text,
  away_id text not null, away_abbr text not null, away_name text not null, away_logo text, away_score int, away_ml text,
  winner_id text,
  updated_at timestamptz not null default now()
);
create index games_season_week on games (season, week);
alter table games enable row level security;

-- Moneyline picks point at a game and a team. Weeks 1-2 leave these empty.
alter table picks
  add column event_id text references games(event_id),
  add column team_id text,
  add column team_abbr text,
  add column team_name text,
  add column rationale text;

-- One person per game per week. This is what blocks everyone else.
-- (Empty event_ids from weeks 1-2 don't count against each other.)
alter table picks add constraint picks_one_per_game unique (week_id, event_id);

-- Matchup picking starts in week 3; the app is currently on week 3.
alter table settings add column ml_start_week int not null default 3;
update settings set current_week = greatest(current_week, 3);
