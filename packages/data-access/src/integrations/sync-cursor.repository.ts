import type { SyncCursor } from './sync-cursor.entity.js';

export interface SyncCursorRepository {
	get(connectorId: string, scopeKey: string): Promise<SyncCursor | undefined>;
	upsert(connectorId: string, scopeKey: string, cursor: Record<string, unknown>): Promise<SyncCursor>;
	listByConnector(connectorId: string): Promise<SyncCursor[]>;
	deleteByConnector(connectorId: string): Promise<void>;
}
