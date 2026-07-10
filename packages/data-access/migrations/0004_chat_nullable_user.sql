-- Chat (Step 6) ships before authentication (Step 9). Until then there is no
-- authenticated user to attribute a conversation to, so user_id becomes
-- nullable; the auth step will populate it and may tighten this again.

alter table chats alter column user_id drop not null;
