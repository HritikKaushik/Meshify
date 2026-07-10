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

		this.connecting = this.connectOrReuse();
		try {
			return await this.connecting;
		} finally {
			this.connecting = undefined;
		}
	}

	/**
	 * Reuses the single client instance across the process lifetime instead of
	 * constructing a new one on every failed connect attempt. With
	 * `persist: true`, a client that fails its initial connect() keeps
	 * retrying in the background on its own; if getClient() responded to that
	 * failure by creating a brand-new client, the old one's retry loop would
	 * be orphaned (never disconnected, never reused) and every subsequent
	 * failed call would spawn another one, compounding indefinitely.
	 */
	private async connectOrReuse(): Promise<RocketRideClient> {
		if (!this.client) {
			this.client = this.createClient();
		}
		if (!this.client.isConnected()) {
			await this.client.connect();
		}
		return this.client;
	}

	private createClient(): RocketRideClient {
		return new RocketRideClient({
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
	}

	/**
	 * Subscribe to all of this API key's tasks (`token: "*"`) for the given
	 * event types. Used by the observability ingester; re-subscribed by the
	 * SDK automatically after a reconnect.
	 */
	async subscribeAllTasks(types: string[]): Promise<void> {
		const client = await this.getClient();
		await client.addMonitor({ token: '*' }, types);
	}

	async shutdown(): Promise<void> {
		if (this.client) {
			await this.client.disconnect();
			this.client = undefined;
		}
	}
}
