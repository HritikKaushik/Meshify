import type { HistoryOptions, SlackClient } from './slack-client.js';
import type { SlackChannelInfo, SlackMessage, SlackUserInfo } from './types.js';

export interface FakeSlackSeed {
	channels?: SlackChannelInfo[];
	/** Top-level channel history, keyed by channelId (chronological). */
	history?: Record<string, SlackMessage[]>;
	/** Thread replies keyed by `${channelId}:${threadTs}` (chronological, includes parent). */
	replies?: Record<string, SlackMessage[]>;
	users?: Record<string, SlackUserInfo>;
	permalinkBase?: string;
	/** channelId → Slack API error code fetchHistory should throw (e.g. { C9: 'not_in_channel' }). */
	historyErrors?: Record<string, string>;
}

/**
 * In-memory SlackClient for unit/integration tests — no network. Mirrors the
 * pagination-flattened shape of HttpSlackClient (returns all pages, chronological)
 * and honors the `oldest` cursor so incremental-sync tests are meaningful.
 */
export class FakeSlackClient implements SlackClient {
	constructor(private readonly seed: FakeSlackSeed = {}) {}

	async listChannels(): Promise<SlackChannelInfo[]> {
		return this.seed.channels ?? [];
	}

	async fetchHistory(_token: string, channelId: string, opts: HistoryOptions = {}): Promise<SlackMessage[]> {
		const error = this.seed.historyErrors?.[channelId];
		if (error) throw new Error(`Slack conversations.history error: ${error}`);
		const all = (this.seed.history?.[channelId] ?? []).slice().sort((a, b) => Number(a.ts) - Number(b.ts));
		const oldest = opts.oldest ? Number(opts.oldest) : undefined;
		return oldest === undefined ? all : all.filter((m) => Number(m.ts) > oldest);
	}

	async fetchReplies(_token: string, channelId: string, threadTs: string): Promise<SlackMessage[]> {
		return (this.seed.replies?.[`${channelId}:${threadTs}`] ?? []).slice().sort((a, b) => Number(a.ts) - Number(b.ts));
	}

	async getUserInfo(_token: string, userId: string): Promise<SlackUserInfo> {
		return this.seed.users?.[userId] ?? { id: userId, name: userId };
	}

	async getPermalink(_token: string, channelId: string, messageTs: string): Promise<string | null> {
		const base = this.seed.permalinkBase ?? 'https://example.slack.com/archives';
		return `${base}/${channelId}/p${messageTs.replace('.', '')}`;
	}
}
