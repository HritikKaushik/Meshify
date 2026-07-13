-- Conversation-centric workspace sidebar: let users pin conversations so the
-- sidebar can surface Pinned vs Recent from real data (not a client-only guess).
alter table chats add column pinned boolean not null default false;

create index idx_chats_project_pinned on chats (project_id, pinned);
