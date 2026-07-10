import type pg from 'pg';
import type { Document, DocumentStatus } from './document.entity.js';
import type { CreateDocumentInput, DocumentRepository } from './document.repository.js';

interface DocumentRow {
	id: string;
	project_id: string;
	source_type: string;
	filename: string;
	object_storage_key: string;
	content_hash: string;
	status: string;
	created_at: Date;
	updated_at: Date;
}

function toDomain(row: DocumentRow): Document {
	return {
		id: row.id,
		projectId: row.project_id,
		sourceType: row.source_type as Document['sourceType'],
		filename: row.filename,
		objectStorageKey: row.object_storage_key,
		contentHash: row.content_hash,
		status: row.status as DocumentStatus,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresDocumentRepository implements DocumentRepository {
	constructor(private readonly pool: pg.Pool) {}

	async create(input: CreateDocumentInput): Promise<Document> {
		const { rows } = await this.pool.query<DocumentRow>(
			`insert into documents (id, project_id, source_type, filename, object_storage_key, content_hash)
			 values ($1, $2, $3, $4, $5, $6)
			 returning *`,
			[input.id, input.projectId, input.sourceType, input.filename, input.objectStorageKey, input.contentHash]
		);
		const row = rows[0];
		if (!row) throw new Error('Insert into documents returned no row');
		return toDomain(row);
	}

	async findById(id: string): Promise<Document | undefined> {
		const { rows } = await this.pool.query<DocumentRow>('select * from documents where id = $1', [id]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async findByProjectAndHash(projectId: string, contentHash: string): Promise<Document | undefined> {
		const { rows } = await this.pool.query<DocumentRow>('select * from documents where project_id = $1 and content_hash = $2 order by created_at desc limit 1', [projectId, contentHash]);
		const row = rows[0];
		return row ? toDomain(row) : undefined;
	}

	async updateStatus(id: string, status: DocumentStatus): Promise<void> {
		await this.pool.query('update documents set status = $2, updated_at = now() where id = $1', [id, status]);
	}
}
