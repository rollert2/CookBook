-- ============================================================
-- ROLL COOKBOOK — Chatroom images + message removal
-- Run this in the Supabase SQL Editor (rollcookbook project)
-- ============================================================

-- Per-room image toggle (default off; admin enables per room)
alter table public.chat_rooms add column if not exists allow_images boolean default false;

-- Image attachment on a chat message
alter table public.chat_messages add column if not exists image_url text;

-- Removal marker: null = live, 'user' = removed by author, 'mod' = removed by admin
alter table public.chat_messages add column if not exists removed_by text;
