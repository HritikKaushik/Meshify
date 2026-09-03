import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export interface ObjectStorageConfig {
	endpoint: string;
	region: string;
	bucket: string;
	accessKeyId: string;
	secretAccessKey: string;
	forcePathStyle: boolean;
}

/**
 * Thin S3-compatible wrapper — MinIO locally, real S3/Backblaze B2/R2/Spaces in
 * production, per the confirmed Phase I decision. Callers never touch the
 * AWS SDK directly so swapping providers only ever touches ObjectStorageConfig.
 */
export class ObjectStorageClient {
	private readonly s3: S3Client;
	private readonly bucket: string;

	constructor(config: ObjectStorageConfig) {
		this.bucket = config.bucket;
		this.s3 = new S3Client({
			endpoint: config.endpoint,
			region: config.region,
			forcePathStyle: config.forcePathStyle,
			credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
			// The AWS SDK (>= ~3.729) sends default CRC32 request checksums, which
			// stricter S3-compatible endpoints (Backblaze B2, some MinIO/Ceph builds)
			// reject. Send checksums only when an operation actually requires them —
			// maximally portable across every S3-alternative, a no-op against real S3.
			requestChecksumCalculation: 'WHEN_REQUIRED',
			responseChecksumValidation: 'WHEN_REQUIRED',
			// Bound every call: the SDK's default is no socket timeout, so a black-holed
			// connection held a worker slot until BullMQ's stall detection (or nothing)
			// intervened. Uploads of the 50-100 MB maximum objects fit comfortably.
			requestHandler: { connectionTimeout: 10_000, requestTimeout: 120_000 },
		});
	}

	async putObject(key: string, body: Buffer, contentType?: string): Promise<void> {
		await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
	}

	async getObject(key: string): Promise<Buffer> {
		const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
		if (!result.Body) throw new Error(`Object storage returned no body for key "${key}"`);
		const chunks: Uint8Array[] = [];
		for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
			chunks.push(chunk);
		}
		return Buffer.concat(chunks);
	}

	async deleteObject(key: string): Promise<void> {
		await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
	}
}
