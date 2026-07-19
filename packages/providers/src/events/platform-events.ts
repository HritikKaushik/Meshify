/**
 * The provider-independent event vocabulary, organized into six domains:
 *
 *   connection.*  — the org-level grant's lifecycle (established/revoked/…)
 *   resource.*    — a source container changed shape (repo renamed, channel gone)
 *   content.*     — knowledge-bearing activity inside a resource (push, message)
 *   permission.*  — the grant's resource/permission set changed
 *   health.*      — integration health transitions
 *   sync.*        — synchronization requests and outcomes
 *
 * Webhook payloads are translated into these by each provider's
 * `normalizeWebhook`; every consumer — the sync dispatcher, SSE hubs, health
 * maintenance, and future features (analytics, notifications, AI summaries) —
 * subscribes to events, never to providers.
 */

interface BasePlatformEvent {
	provider: string;
	integrationId: string;
	/** Org owning the integration — the SSE routing key. */
	orgId: string;
}

export type PlatformEvent =
	// --- connection domain ---------------------------------------------------
	| (BasePlatformEvent & { kind: 'connection.established' })
	| (BasePlatformEvent & { kind: 'connection.revoked' })
	| (BasePlatformEvent & { kind: 'connection.suspended' })
	| (BasePlatformEvent & { kind: 'connection.disconnected' })
	// --- resource domain -----------------------------------------------------
	| (BasePlatformEvent & { kind: 'resource.updated'; resourceType: string; externalResourceId: string; hint?: Record<string, unknown> })
	| (BasePlatformEvent & { kind: 'resource.removed'; resourceType: string; externalResourceId: string })
	| (BasePlatformEvent & { kind: 'resource.renamed'; resourceType: string; externalResourceId: string; name: string; previousName?: string })
	| (BasePlatformEvent & { kind: 'resource.discovered'; resourceType: string; externalResourceId: string; name: string })
	// --- content domain ------------------------------------------------------
	| (BasePlatformEvent & { kind: 'content.changed'; scopeRef: string; hint?: Record<string, unknown> })
	// --- permission domain ---------------------------------------------------
	| (BasePlatformEvent & { kind: 'permission.changed'; added: string[]; removed: string[] })
	// --- health domain -------------------------------------------------------
	| (BasePlatformEvent & { kind: 'health.changed'; health: string; detail?: Record<string, unknown> })
	// --- sync domain ---------------------------------------------------------
	| (BasePlatformEvent & { kind: 'sync.requested'; connectorId: string; projectId: string; mode: 'full' | 'incremental'; reason: SyncReason })
	| (BasePlatformEvent & { kind: 'sync.completed'; connectorId: string; projectId: string; itemsUpserted: number; itemsRemoved: number })
	| (BasePlatformEvent & { kind: 'sync.failed'; connectorId: string; projectId: string; error: string });

export type SyncReason = 'webhook' | 'manual' | 'scheduled' | 'reconcile' | 'initial';

export type PlatformEventKind = PlatformEvent['kind'];

export type PlatformEventDomain = 'connection' | 'resource' | 'content' | 'permission' | 'health' | 'sync';

/** Domain of an event kind — consumers can subscribe at domain granularity. */
export function eventDomain(kind: PlatformEventKind): PlatformEventDomain {
	return kind.split('.', 1)[0] as PlatformEventDomain;
}

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
