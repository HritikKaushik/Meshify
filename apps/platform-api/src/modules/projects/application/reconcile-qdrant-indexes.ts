import type { ProjectRepository } from '@meshify/data-access';

export interface PayloadIndexProvisioner {
	ensurePayloadIndexes(collection: string): Promise<string[] | undefined>;
}

interface ReconcileLogger {
	info(obj: Record<string, unknown>, msg: string): void;
	warn(obj: Record<string, unknown>, msg: string): void;
}

/**
 * One-time backfill run in the background at boot: collections provisioned
 * before payload indexes existed get them now. Idempotent and best-effort
 * (per-collection failures are logged, never thrown), so a Qdrant hiccup can
 * neither block startup nor leave the sweep half-done for good - the next
 * boot simply picks up where it left off.
 */
export async function reconcileQdrantPayloadIndexes(projects: ProjectRepository, qdrant: PayloadIndexProvisioner, logger: ReconcileLogger): Promise<{ created: number; failed: number }> {
	let created = 0;
	let failed = 0;
	const all = await projects.listAll();
	for (const project of all) {
		for (const collection of [project.qdrantCollectionDocs, project.qdrantCollectionCode]) {
			if (!collection) continue;
			try {
				const fields = await qdrant.ensurePayloadIndexes(collection);
				if (fields && fields.length > 0) {
					created += fields.length;
					logger.info({ projectId: project.id, collection, fields }, 'created missing Qdrant payload indexes');
				}
			} catch (err) {
				failed += 1;
				logger.warn({ projectId: project.id, collection, err: err instanceof Error ? err.message : String(err) }, 'Qdrant payload index backfill failed for collection');
			}
		}
	}
	return { created, failed };
}
