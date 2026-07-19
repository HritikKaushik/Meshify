/**
 * The provider-independent event vocabulary. Webhook payloads are translated
 * into these by each provider's `normalizeWebhook`; every consumer — the sync
 * dispatcher, SSE hubs, health maintenance, and future features (analytics,
 * notifications, AI summaries) — subscribes to events, never to providers.
 */

interface BasePlatformEvent {
	provider: string;
	integrationId: string;
	/** Org owning the integration — the SSE routing key. */
	orgId: string;
}

export type PlatformEvent =
	/** A synced resource changed at the source (push, file edit) — schedule an incremental sync. */
	| (BasePlatformEvent & { kind: 'resource.updated'; resourceType: string; externalResourceId: string; hint?: Record<string, unknown> })
	| (BasePlatformEvent & { kind: 'resource.removed'; resourceType: string; externalResourceId: string })
	| (BasePlatformEvent & { kind: 'resource.renamed'; resourceType: string; externalResourceId: string; name: string; previousName?: string })
	/** Chat-style activity in a followed scope — debounced into an incremental sync. */
	| (BasePlatformEvent & { kind: 'activity.message'; channelRef: string })
	/** The grant's resource/permission set changed (repos added/removed, scopes changed). */
	| (BasePlatformEvent & { kind: 'grant.changed'; added: string[]; removed: string[] })
	| (BasePlatformEvent & { kind: 'installation.revoked' })
	| (BasePlatformEvent & { kind: 'installation.suspended' })
	| (BasePlatformEvent & { kind: 'integration.connected' })
	| (BasePlatformEvent & { kind: 'integration.disconnected' })
	| (BasePlatformEvent & { kind: 'integration.health_changed'; health: string; detail?: Record<string, unknown> });

export type PlatformEventKind = PlatformEvent['kind'];

/** A published event, stamped by the bus. */
export type StampedPlatformEvent = PlatformEvent & { at: string };

export type PlatformEventHandler = (event: StampedPlatformEvent) => void;

/**
 * The internal event bus port. The v1 transport is Redis Pub/Sub (live
 * fan-out) with BullMQ as the durable consumption side; upgrading to a
 * streams-based transport later is an implementation swap behind this port.
 */
export interface PlatformEventBus {
	publish(event: PlatformEvent): Promise<void>;
	subscribe(handler: PlatformEventHandler): () => void;
}
