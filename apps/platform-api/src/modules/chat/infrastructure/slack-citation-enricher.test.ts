import { describe, expect, it } from 'vitest';
import { InMemorySlackConversationRepository, buildSlackConversation } from '@meshify/testing';
import { SlackCitationEnricher } from './slack-citation-enricher.js';

describe('SlackCitationEnricher', () => {
	it('enriches a Slack citation with channel/thread/author/timestamp/permalink', async () => {
		const repo = new InMemorySlackConversationRepository([
			buildSlackConversation({ sourcePath: 'slack/T123/C123/t100', channelName: 'engineering', permalink: 'https://acme.slack.com/p1', participants: [{ id: 'U1', name: 'Ada' }] }),
		]);
		const enricher = new SlackCitationEnricher(repo);

		const [citation] = await enricher.enrich('proj-1', [{ sourcePath: 'slack/T123/C123/t100', score: 0.9 }]);

		expect(citation!.source).toBe('slack');
		expect(citation!.slack?.channel).toBe('engineering');
		expect(citation!.slack?.author).toBe('Ada');
		expect(citation!.slack?.permalink).toBe('https://acme.slack.com/p1');
		expect(citation!.slack?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it('tags a Slack citation as slack even when the conversation is missing', async () => {
		const enricher = new SlackCitationEnricher(new InMemorySlackConversationRepository());
		const [citation] = await enricher.enrich('proj-1', [{ sourcePath: 'slack/T/C/tX', score: 0.4 }]);
		expect(citation!.source).toBe('slack');
		expect(citation!.slack).toBeUndefined();
	});

	it('passes non-Slack citations through untouched', async () => {
		const enricher = new SlackCitationEnricher(new InMemorySlackConversationRepository());
		const [citation] = await enricher.enrich('proj-1', [{ sourcePath: 'src/index.ts', score: 0.5 }]);
		expect(citation!.source).toBeUndefined();
		expect(citation!.slack).toBeUndefined();
	});
});
