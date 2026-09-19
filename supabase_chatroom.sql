-- ============================================================
-- ROLL COOKBOOK — Chatroom
-- Run this in the Supabase SQL Editor (rollcookbook project)
-- Creates topic rooms + messages, and seeds 3 default rooms.
-- ============================================================

-- Topic rooms
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text default '',
  emoji text default '💬',
  created_at timestamptz not null default now()
);

-- Messages (one per topic room)
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  username text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- Seed default rooms (idempotent)
insert into public.chat_rooms (name, description, emoji)
select 'General', 'Casual chat, whatever is cooking', '💬'
where not exists (select 1 from public.chat_rooms where name = 'General');

insert into public.chat_rooms (name, description, emoji)
select 'Recipe Help', 'Ask for cooking and recipe advice', '🆘'
where not exists (select 1 from public.chat_rooms where name = 'Recipe Help');

insert into public.chat_rooms (name, description, emoji)
select 'Show Your Dish', 'Post what you made, get feedback', '📸'
where not exists (select 1 from public.chat_rooms where name = 'Show Your Dish');
