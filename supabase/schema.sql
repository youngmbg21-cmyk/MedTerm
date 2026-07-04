-- ============================================================
-- MedTerminal Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Settings table (stores Claude API key and other config)
create table if not exists public.settings (
  id uuid default gen_random_uuid() primary key,
  key text unique not null,
  value text not null,
  updated_at timestamptz default now()
);

-- Auto-update the updated_at timestamp
create or replace function public.update_settings_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger settings_updated_at
  before update on public.settings
  for each row
  execute function public.update_settings_timestamp();

-- 2. Row Level Security for settings
-- Only the admin user (identified by email) can read/write settings
alter table public.settings enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Admin read settings" on public.settings;
drop policy if exists "Admin write settings" on public.settings;
drop policy if exists "Admin update settings" on public.settings;
drop policy if exists "Admin delete settings" on public.settings;
drop policy if exists "Service role full access to settings" on public.settings;

-- Service role (used by Edge Functions) gets full access
-- This is how the claude-proxy Edge Function reads the API key
create policy "Service role full access to settings"
  on public.settings
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Admin user policies (replace email with your actual admin email)
-- IMPORTANT: After running this, update 'youngmbg21@gmail.com' to your admin email
create policy "Admin read settings"
  on public.settings
  for select
  using (auth.jwt() ->> 'email' = 'youngmbg21@gmail.com');

create policy "Admin write settings"
  on public.settings
  for insert
  with check (auth.jwt() ->> 'email' = 'youngmbg21@gmail.com');

create policy "Admin update settings"
  on public.settings
  for update
  using (auth.jwt() ->> 'email' = 'youngmbg21@gmail.com')
  with check (auth.jwt() ->> 'email' = 'youngmbg21@gmail.com');

create policy "Admin delete settings"
  on public.settings
  for delete
  using (auth.jwt() ->> 'email' = 'youngmbg21@gmail.com');

-- 3. Chat sessions table
create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  title text,
  created_at timestamptz default now()
);

alter table public.chat_sessions enable row level security;

drop policy if exists "Users read own sessions" on public.chat_sessions;
drop policy if exists "Users create own sessions" on public.chat_sessions;
drop policy if exists "Service role full access to chat_sessions" on public.chat_sessions;

create policy "Service role full access to chat_sessions"
  on public.chat_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create policy "Users read own sessions"
  on public.chat_sessions for select
  using (auth.uid() = user_id);

create policy "Users create own sessions"
  on public.chat_sessions for insert
  with check (auth.uid() = user_id);

-- 4. Chat messages table
create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  tool_calls jsonb,
  created_at timestamptz default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists "Service role full access to chat_messages" on public.chat_messages;

create policy "Service role full access to chat_messages"
  on public.chat_messages for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- 5. Grant Edge Functions access via service_role
-- (Edge Functions use SUPABASE_SERVICE_ROLE_KEY automatically)
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
