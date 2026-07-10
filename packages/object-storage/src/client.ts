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
 * Thin S3-compatible wrapper — MinIO locally, real S3/R2/Spaces in
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
