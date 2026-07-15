import type { SlackChannelInfo, SlackMessage, SlackUserInfo } from './types.js';

export interface HistoryOptions {
	/** Slack `ts` lower bound (exclusive-ish) — only messages newer than this are returned. Drives incremental sync. */
	oldest?: string;
	latest?: string;
}

/**
 * Read-only Slack Web API operations used by connector ingestion and sync.
 * Behind a port so the worker/use cases can be unit-tested with FakeSlackClient
 * and so the Slack SDK stays isolated to this package (mirrors @meshify/github).
 */
export interface SlackClient {
	/** All public + private channels the token's bot is a member of. */
	listChannels(token: string): Promise<SlackChannelInfo[]>;
	/** Channel history (top-level messages), fully paginated, oldest→newest. */
	fetchHistory(token: string, channelId: string, opts?: HistoryOptions): Promise<SlackMessage[]>;
	/** All replies in a thread (includes the parent), fully paginated. */
	fetchReplies(token: string, channelId: string, threadTs: string): Promise<SlackMessage[]>;
	getUserInfo(token: string, userId: string): Promise<SlackUserInfo>;
	getPermalink(token: string, channelId: string, messageTs: string): Promise<string | null>;
}

interface SlackApiResponse {
	ok: boolean;
	error?: string;
	response_metadata?: { next_cursor?: string };
	[key: string]: unknown;
}

const SLACK_API_BASE = 'https://slack.com/api';
const MAX_RETRY_ON_RATE_LIMIT = 5;
const PAGE_LIMIT = 200;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * HTTP Slack client with no SDK dependency — plain `fetch`. Handles Slack's
 * cursor pagination and its aggressive tier rate limits: a 429 is retried up to
 * MAX_RETRY_ON_RATE_LIMIT times honoring the `Retry-After` header.
 */
export class HttpSlackClient implements SlackClient {
	constructor(private readonly apiBaseUrl: string = SLACK_API_BASE) {}

	async listChannels(token: string): Promise<SlackChannelInfo[]> {
		const channels: SlackChannelInfo[] = [];
		let cursor: string | undefined;
		do {
			const body = await this.call('conversations.list', token, {
				types: 'public_channel,private_channel',
				exclude_archived: 'true',
				limit: String(PAGE_LIMIT),
				...(cursor ? { cursor } : {}),
			});
			const raw = (body.channels as Array<{ id: string; name?: string; is_private?: boolean }>) ?? [];
			for (const c of raw) channels.push({ id: c.id, name: c.name ?? c.id, isPrivate: c.is_private ?? false });
			cursor = body.response_metadata?.next_cursor || undefined;
		} while (cursor);
		return channels;
	}

	async fetchHistory(token: string, channelId: string, opts: HistoryOptions = {}): Promise<SlackMessage[]> {
		const messages: SlackMessage[] = [];
		let cursor: string | undefined;
		do {
			const body = await this.call('conversations.history', token, {
				channel: channelId,
				limit: String(PAGE_LIMIT),
				...(opts.oldest ? { oldest: opts.oldest } : {}),
				...(opts.latest ? { latest: opts.latest } : {}),
				...(cursor ? { cursor } : {}),
			});
			for (const m of (body.messages as unknown[]) ?? []) messages.push(toMessage(m));
			cursor = body.response_metadata?.next_cursor || undefined;
		} while (cursor);
		// Slack returns newest-first; return chronological for stable grouping/rendering.
		return messages.sort((a, b) => Number(a.ts) - Number(b.ts));
	}

	async fetchReplies(token: string, channelId: string, threadTs: string): Promise<SlackMessage[]> {
		const messages: SlackMessage[] = [];
		let cursor: string | undefined;
		do {
			const body = await this.call('conversations.replies', token, {
				channel: channelId,
				ts: threadTs,
				limit: String(PAGE_LIMIT),
				...(cursor ? { cursor } : {}),
			});
			for (const m of (body.messages as unknown[]) ?? []) messages.push(toMessage(m));
			cursor = body.response_metadata?.next_cursor || undefined;
		} while (cursor);
		return messages.sort((a, b) => Number(a.ts) - Number(b.ts));
	}

	async getUserInfo(token: string, userId: string): Promise<SlackUserInfo> {
		const body = await this.call('users.info', token, { user: userId });
		const user = (body.user as { real_name?: string; profile?: { display_name?: string }; name?: string }) ?? {};
		return { id: userId, name: user.real_name || user.profile?.display_name || user.name || userId };
	}

	async getPermalink(token: string, channelId: string, messageTs: string): Promise<string | null> {
		try {
			const body = await this.call('chat.getPermalink', token, { channel: channelId, message_ts: messageTs });
			return typeof body.permalink === 'string' ? body.permalink : null;
		} catch {
			// A permalink is best-effort enrichment — never fail ingestion over it.
			return null;
		}
	}

	private async call(method: string, token: string, params: Record<string, string>): Promise<SlackApiResponse> {
		for (let attempt = 0; ; attempt++) {
			const res = await fetch(`${this.apiBaseUrl}/${method}`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${token}`,
					'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
				},
				body: new URLSearchParams(params).toString(),
			});

			if (res.status === 429 && attempt < MAX_RETRY_ON_RATE_LIMIT) {
				const retryAfter = Number(res.headers.get('retry-after') ?? '1');
				await sleep((Number.isFinite(retryAfter) ? retryAfter : 1) * 1000);
				continue;
			}

			if (!res.ok) throw new Error(`Slack ${method} failed: HTTP ${res.status}`);

			const body = (await res.json()) as SlackApiResponse;
			if (!body.ok) {
				// ratelimited can also arrive as a 200 with ok:false.
				if (body.error === 'ratelimited' && attempt < MAX_RETRY_ON_RATE_LIMIT) {
					await sleep(1000);
					continue;
				}
				throw new Error(`Slack ${method} error: ${body.error ?? 'unknown'}`);
			}
			return body;
		}
	}
}

function toMessage(raw: unknown): SlackMessage {
	const m = raw as {
		ts: string;
		thread_ts?: string;
		user?: string;
		text?: string;
		subtype?: string;
		reactions?: Array<{ name: string; count: number }>;
	};
	return {
		ts: m.ts,
		threadTs: m.thread_ts,
		user: m.user,
		text: m.text ?? '',
		subtype: m.subtype,
		reactions: m.reactions?.map((r) => ({ name: r.name, count: r.count })),
	};
}
