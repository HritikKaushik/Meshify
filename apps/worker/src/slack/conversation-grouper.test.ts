import { describe, expect, it } from 'vitest';
import { groupConversations, slackTsToIso, type GrouperMessage } from './conversation-grouper.js';

const names = new Map<string, string>([
	['U1', 'Ada'],
	['U2', 'Grace'],
]);

describe('groupConversations', () => {
	it('groups a thread (parent + replies) into one conversation', () => {
		const messages: GrouperMessage[] = [
			{ ts: '100.0001', threadTs: '100.0001', user: 'U1', text: 'How do refunds retry?' },
			{ ts: '101.0002', threadTs: '100.0001', user: 'U2', text: 'Exponential backoff, 5 attempts.' },
			{ ts: '102.0003', threadTs: '100.0001', user: 'U1', text: 'Thanks!' },
		];

		const [conversation, ...rest] = groupConversations('engineering', messages, names);

		expect(rest).toHaveLength(0);
		expect(conversation!.anchor).toBe('t100.0001');
		expect(conversation!.threadTs).toBe('100.0001');
		expect(conversation!.messageCount).toBe(3);
		expect(conversation!.participants.map((p) => p.name).sort()).toEqual(['Ada', 'Grace']);
		expect(conversation!.tsStart).toBe('100.0001');
		expect(conversation!.tsEnd).toBe('102.0003');
		expect(conversation!.renderedText).toContain('Slack thread in #engineering');
		expect(conversation!.renderedText).toContain('[Ada at');
	});

	it('windows non-threaded messages by time gap: close ones merge, far ones split', () => {
		const messages: GrouperMessage[] = [
			{ ts: '100.0001', user: 'U1', text: 'deploy is green' },
			{ ts: '200.0001', user: 'U2', text: 'nice' }, // 100s later → same window
			{ ts: '5000.0001', user: 'U1', text: 'unrelated hours later' }, // >1800s later → new window
		];

		const conversations = groupConversations('ops', messages, names);

		expect(conversations).toHaveLength(2);
		expect(conversations[0]!.anchor).toBe('w100.0001');
		expect(conversations[0]!.messageCount).toBe(2);
		expect(conversations[1]!.anchor).toBe('w5000.0001');
		expect(conversations[1]!.messageCount).toBe(1);
	});

	it('drops system messages by subtype even when they carry text, and counts + renders reactions', () => {
		const messages: GrouperMessage[] = [
			// Real Slack system messages carry non-empty text — must be dropped by subtype, not by emptiness.
			{ ts: '100.0001', user: 'U1', text: '<@U1> has joined the channel', subtype: 'channel_join' },
			{ ts: '100.5001', user: 'U2', text: 'set the channel topic: launch', subtype: 'channel_topic' },
			{ ts: '101.0001', user: 'U1', text: 'ship it', reactions: [{ name: 'rocket', count: 3 }] },
		];

		const conversations = groupConversations('ops', messages, names);
		expect(conversations).toHaveLength(1);
		expect(conversations[0]!.messageCount).toBe(1);
		expect(conversations[0]!.reactionCount).toBe(3);
		// Reactions are rendered into the embedded text so they inform retrieval.
		expect(conversations[0]!.renderedText).toContain(':rocket: (3)');
	});

	it('content hash is stable for identical content and changes when text changes', () => {
		const base: GrouperMessage[] = [{ ts: '100.0001', user: 'U1', text: 'hello' }];
		const a = groupConversations('c', base, names)[0]!;
		const b = groupConversations('c', base, names)[0]!;
		const c = groupConversations('c', [{ ts: '100.0001', user: 'U1', text: 'hello world' }], names)[0]!;
		expect(a.contentHash).toBe(b.contentHash);
		expect(a.contentHash).not.toBe(c.contentHash);
	});

	it('renders slack ts as ISO seconds', () => {
		expect(slackTsToIso('1700000000.000100')).toBe('2023-11-14T22:13:20.000Z');
	});
});
