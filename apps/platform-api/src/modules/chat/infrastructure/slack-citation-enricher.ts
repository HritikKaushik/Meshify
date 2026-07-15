import { isSlackSourcePath, type MessageCitation, type SlackConversationRepository } from '@meshify/data-access';
import type { CitationEnricher } from '../application/citation-enricher.port.js';

/** Slack `ts` (`<epochSeconds>.<micros>`) → ISO time for citation display. */
function slackTsToIso(ts: string | null): string | null {
	if (!ts) return null;
	const seconds = Number(ts.split('.')[0]);
	return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : ts;
}

/**
 * Attaches Slack conversation metadata (channel, thread, author/participants,
 * timestamp, permalink) to any citation whose source_path is a `slack/...` path,
 * by resolving it back to its slack_conversations row. Non-Slack citations pass
 * through unchanged. Lookups are best-effort — a missing row just yields a
 * source-tagged citation without the extra fields.
 */
export class SlackCitationEnricher implements CitationEnricher {
	constructor(private readonly slackConversations: SlackConversationRepository) {}

	async enrich(projectId: string, citations: MessageCitation[]): Promise<MessageCitation[]> {
		return Promise.all(
			citations.map(async (citation) => {
				if (!isSlackSourcePath(citation.sourcePath)) return citation;

				const conversation = await this.slackConversations.findByProjectAndSourcePath(projectId, citation.sourcePath).catch(() => undefined);
				if (!conversation) return { ...citation, source: 'slack' as const };

				const participants = conversation.participants.map((p) => p.name);
				return {
					...citation,
					source: 'slack' as const,
					slack: {
						channel: conversation.channelName,
						channelId: conversation.channelId,
						threadTs: conversation.threadTs,
						author: participants[0] ?? null,
						participants,
						timestamp: slackTsToIso(conversation.tsStart),
						permalink: conversation.permalink,
					},
				};
			})
		);
	}
}
