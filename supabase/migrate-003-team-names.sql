-- Run once in Supabase -> SQL Editor. Stores each person's fantasy team so the
-- app can show team names and link to ESPN automatically.
alter table members add column if not exists team_name text;
alter table members add column if not exists team_abbr text;
alter table members add column if not exists team_logo text;
alter table members add column if not exists team_owner text;
