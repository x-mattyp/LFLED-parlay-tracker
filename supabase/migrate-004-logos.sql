-- Run once in Supabase -> SQL Editor. Saves a copy of each team's logo in
-- Supabase Storage so every picture loads, and lets the commish upload one.
alter table members add column if not exists logo_url text;      -- saved copy the app shows
alter table members add column if not exists logo_source text;   -- 'espn' or 'upload'
alter table members add column if not exists logo_src_seen text; -- ESPN link the saved copy came from
alter table members add column if not exists logo_error text;    -- why ESPN's logo couldn't be saved

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;
