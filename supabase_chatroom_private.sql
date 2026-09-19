-- ============================================================
-- ROLL COOKBOOK — Chatroom private rooms
-- Run this in the Supabase SQL Editor (rollcookbook project)
-- Adds admin-restricted private rooms to chat_rooms.
-- ============================================================

alter table public.chat_rooms add column if not exists is_private boolean default false;
alter table public.chat_rooms add column if not exists members text[] default '{}';
