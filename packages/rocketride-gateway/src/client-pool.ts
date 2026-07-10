import { RocketRideClient, type DAPMessage } from 'rocketride';
import type { Env } from '@meshify/config';

export interface ClientPoolLogger {
	info(obj: Record<string, unknown>, msg: string): void;
	warn(obj: Record<string, unknown>, msg: string): void;
	error(obj: Record<string, unknown>, msg: string): void;
}

/**
 * Owns a single, long-lived RocketRideClient per process. Per RocketRide's own
 * guidance, starting a client/pipeline per request is a documented anti-pattern
 * (client.use() is slow); every app/worker process connects exactly once at
 * boot and reuses this client for the lifetime of the process.
 */
export class RocketRideClientPool {
	private client: RocketRideClient | undefined;
	private connecting: Promise<RocketRideClient> | undefined;

	constructor(
		private readonly env: Env,
		private readonly logger: ClientPoolLogger,
		private readonly onEvent?: (event: DAPMessage) => Promise<void>
	) {}

	async getClient(): Promise<RocketRideClient> {
		if (this.client?.isConnected()) return this.client;
		if (this.connecting) return this.connecting;

		this.connecting = this.connect();
		try {
			this.client = await this.connecting;
			return this.client;
		} finally {
			this.connecting = undefined;
		}
	}

	private async connect(): Promise<RocketRideClient> {
		const client = new RocketRideClient({
			uri: this.env.ROCKETRIDE_URI,
			auth: this.env.ROCKETRIDE_APIKEY,
			persist: true,
			onEvent: this.onEvent,
			onConnected: async (info) => {
				this.logger.info({ info }, 'rocketride connected');
			},
			onDisconnected: async (reason, hasError) => {
				if (hasError) this.logger.error({ reason }, 'rocketride connection lost');
				else this.logger.info({ reason }, 'rocketride disconnected');
			},
			onConnectError: async (error) => {
				this.logger.warn({ error: error.message }, 'rocketride connect attempt failed');
			},
		});

		await client.connect();
		return client;
	}

	async shutdown(): Promise<void> {
		if (this.client) {
			await this.client.disconnect();
			this.client = undefined;
		}
	}
}
