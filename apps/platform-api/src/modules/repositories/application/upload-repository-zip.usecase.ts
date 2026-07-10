import { randomUUID } from 'node:crypto';
import type { PipelineJobRepository, RepositoryRepository } from '@meshify/data-access';
import type { ObjectStorageClient } from '@meshify/object-storage';
import type { Queue } from 'bullmq';
import type { RepoIngestJobPayload } from '@meshify/queues';
import type { ConnectRepositoryResult } from './connect-github-repository.usecase.js';

export interface UploadRepositoryZipCommand {
	projectId: string;
	filename: string;
	buffer: Buffer;
}

const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const ZIP_MAGIC = Buffer.from([0x50, 0x4b]); // "PK"

export class UploadRepositoryZipUseCase {
	constructor(
		private readonly repositories: RepositoryRepository,
		private readonly pipelineJobs: PipelineJobRepository,
		private readonly storage: ObjectStorageClient,
		private readonly ingestQueue: Queue<RepoIngestJobPayload>
	) {}

	async execute(command: UploadRepositoryZipCommand): Promise<ConnectRepositoryResult> {
		if (command.buffer.byteLength === 0) throw new Error('Uploaded archive is empty');
		if (command.buffer.byteLength > MAX_ZIP_BYTES) throw new Error(`Archive exceeds the ${MAX_ZIP_BYTES / (1024 * 1024)}MB limit`);
		if (!command.buffer.subarray(0, 2).equals(ZIP_MAGIC)) throw new Error('File is not a ZIP archive');

		const repositoryId = randomUUID();
		const archiveObjectKey = `projects/${command.projectId}/repositories/${repositoryId}/source.zip`;
		await this.storage.putObject(archiveObjectKey, command.buffer, 'application/zip');

		const repository = await this.repositories.create({
			id: repositoryId,
			projectId: command.projectId,
			source: 'zip',
			archiveObjectKey,
		});

		const pipelineJobId = randomUUID();
		await this.pipelineJobs.create({
			id: pipelineJobId,
			projectId: command.projectId,
			jobType: 'clone_repo',
			payload: { repositoryId, filename: command.filename },
		});

		await this.ingestQueue.add('ingest', { pipelineJobId, repositoryId, projectId: command.projectId }, { jobId: pipelineJobId });

		return { repository, jobId: pipelineJobId };
	}
}
