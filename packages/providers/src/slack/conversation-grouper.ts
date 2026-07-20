import { createHash } from 'node:crypto';
import type { SlackParticipant } from '@meshify/data-access';

/**
 * Groups raw Slack messages into semantic *conversation documents* — the unit
 * of embedding — rather than embedding each message. A thread (a parent plus
 * its replies) becomes one conversation; runs of non-threaded channel messages
 * are bucketed into time windows so a burst of related chatter reads as one
 * document. Pure and deterministic (the Slack analogue of repo-scanner.ts) so
 * it is fully unit-testable.
 */

export interface GrouperMessage {
	ts: string;
	threadTs?: string;
	user?: string;
	text: string;
	subtype?: string;
	reactions?: Array<{ name: string; count: number }>;
}

/**
 * Slack system/membership/channel-meta events carry non-empty text (e.g.
 * "@ada has joined the channel") but are noise, not knowledge — drop them by
 * subtype so they never get embedded or cited. Real message subtypes
 * (thread_broadcast, me_message, bot_message, file_share) are kept.
 */
const SYSTEM_SUBTYPES: ReadonlySet<string> = new Set([
	'channel_join',
	'channel_leave',
	'channel_topic',
	'channel_purpose',
	'channel_name',
	'channel_archive',
	'channel_unarchive',
	'group_join',
	'group_leave',
	'group_topic',
	'group_purpose',
	'group_name',
	'group_archive',
	'group_unarchive',
	'pinned_item',
	'unpinned_item',
	'bot_add',
	'bot_remove',
	'reminder_add',
	'tombstone',
]);

export interface GroupedConversation {
	/** `t<threadTs>` for a thread, `w<firstTs>` for a time window — the per-channel identity tail. */
	anchor: string;
	threadTs: string | null;
	tsStart: string;
	tsEnd: string;
	participants: SlackParticipant[];
	messageCount: number;
	reactionCount: number;
	/** Embed-ready text; also what `contentHash` is computed over. */
	renderedText: string;
	contentHash: string;
}

/** Non-threaded messages more than this far apart (seconds) start a new window. */
const DEFAULT_WINDOW_GAP_SECONDS = 30 * 60;

export function groupConversations(
	channelName: string,
	messages: GrouperMessage[],
	userNames: Map<string, string>,
	options: { windowGapSeconds?: number } = {}
): GroupedConversation[] {
	const windowGap = options.windowGapSeconds ?? DEFAULT_WINDOW_GAP_SECONDS;

	// Drop empty messages and system/membership events (joins, topic changes, pins) — they carry no knowledge.
	const usable = messages.filter((m) => m.text.trim().length > 0 && !(m.subtype && SYSTEM_SUBTYPES.has(m.subtype))).sort((a, b) => Number(a.ts) - Number(b.ts));

	// Partition by thread key: parent (thread_ts === ts) and its replies share a key.
	const byThreadKey = new Map<string, GrouperMessage[]>();
	for (const m of usable) {
		const key = m.threadTs ?? m.ts;
		const bucket = byThreadKey.get(key);
		if (bucket) bucket.push(m);
		else byThreadKey.set(key, [m]);
	}

	const conversations: GroupedConversation[] = [];
	const standalone: GrouperMessage[] = [];

	for (const [key, group] of byThreadKey) {
		if (group.length >= 2) {
			conversations.push(buildConversation(`t${key}`, key, channelName, group, userNames));
		} else {
			standalone.push(group[0]!);
		}
	}

	// Window the standalone messages by time gap.
	standalone.sort((a, b) => Number(a.ts) - Number(b.ts));
	let window: GrouperMessage[] = [];
	const flush = () => {
		if (window.length > 0) {
			conversations.push(buildConversation(`w${window[0]!.ts}`, null, channelName, window, userNames));
			window = [];
		}
	};
	for (const m of standalone) {
		const prev = window[window.length - 1];
		if (prev && Number(m.ts) - Number(prev.ts) > windowGap) flush();
		window.push(m);
	}
	flush();

	// Deterministic order: by conversation start time.
	return conversations.sort((a, b) => Number(a.tsStart) - Number(b.tsStart));
}

function buildConversation(anchor: string, threadTs: string | null, channelName: string, group: GrouperMessage[], userNames: Map<string, string>): GroupedConversation {
	const ordered = group.slice().sort((a, b) => Number(a.ts) - Number(b.ts));

	const participantMap = new Map<string, SlackParticipant>();
	const reactionTotals = new Map<string, number>();
	let reactionCount = 0;
	const lines: string[] = [];

	for (const m of ordered) {
		const userId = m.user ?? 'unknown';
		const name = userNames.get(userId) ?? userId;
		if (!participantMap.has(userId)) participantMap.set(userId, { id: userId, name });
		for (const r of m.reactions ?? []) {
			reactionCount += r.count;
			reactionTotals.set(r.name, (reactionTotals.get(r.name) ?? 0) + r.count);
		}
		lines.push(`[${name} at ${slackTsToIso(m.ts)}] ${m.text.trim()}`);
	}

	const header = threadTs ? `Slack thread in #${channelName}` : `Slack conversation in #${channelName}`;
	// Render reactions into the embedded text so this spec-mandated metadata actually informs retrieval.
	const reactionSummary =
		reactionTotals.size > 0
			? `\nReactions: ${[...reactionTotals.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => `:${name}: (${count})`).join(', ')}`
			: '';
	const renderedText = `${header}\n${lines.join('\n')}${reactionSummary}`;

	return {
		anchor,
		threadTs,
		tsStart: ordered[0]!.ts,
		tsEnd: ordered[ordered.length - 1]!.ts,
		participants: [...participantMap.values()],
		messageCount: ordered.length,
		reactionCount,
		renderedText,
		contentHash: createHash('sha256').update(renderedText).digest('hex'),
	};
}

/** Slack `ts` is `<epochSeconds>.<microseconds>`; render the second-precision ISO time. */
export function slackTsToIso(ts: string): string {
	const seconds = Number(ts.split('.')[0]);
	return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : ts;
}
