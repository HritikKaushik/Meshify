-- Production hardening: indexes for the provider-platform hot paths surfaced by
-- the scalability review. All additive; no data change.

-- Reconcile sweep (`listEventTriggeredStale` / `listIntervalDue`) filters
-- integration-linked active connectors by sync_policy trigger + updated_at.
-- Without this it seq-scans knowledge_connectors on every 15-min refresh sweep.
create index idx_kc_reconcile
	on knowledge_connectors ((sync_policy ->> 'trigger'), updated_at)
	where integration_id is not null and status = 'active';

-- Health sweep (`listActiveByProvider`) filters integrations by provider +
-- active status across all orgs.
create index idx_integrations_provider_active
	on integrations (provider)
	where status = 'active';

-- Webhook retention (`deleteTerminalBefore`) and the orphan-recovery sweep
-- (`listReprocessable`) both scan webhook_events by received_at; the existing
-- pending index only covers received/queued, not the terminal-retention delete.
create index idx_webhook_events_received_at on webhook_events (received_at);
