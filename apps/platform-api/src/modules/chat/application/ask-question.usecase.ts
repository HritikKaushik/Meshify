import { randomUUID } from 'node:crypto';
import type { ChatRepository, Project } from '@meshify/data-access';
import type { ChatAnswer, ChatHistoryTurn, RagPort } from '@meshify/rocketride-gateway';
import type { ChatPipelineResolver } from './chat-pipeline.port.js';
import type { ChatContextRetriever } from './chat-context-retriever.port.js';
import { extractReferencedCodeFiles } from '../domain/referenced-code-files.js';
import { buildRagPrompt, type RetrievedChunk } from '../domain/build-rag-prompt.js';

export class ChatNotFoundError extends Error {
	constructor(id: string) {
		super(`Conversation "${id}" does not exist in this project`);
		this.name = 'ChatNotFoundError';
	}
}

export interface AskQuestionCommand {
	project: Project;
	conversationId?: string;
	question: string;
}

export interface AskQuestionResult {
	conversationId: string;
	messageId: string;
	answer: string;
	citations: Array<{ sourcePath: string; chunkId?: string; score: number }>;
	confidence: number;
	retrievedDocuments: Array<{ id: string; sourcePath: string; score: number }>;
	referencedCodeFiles: string[];
	latencyMs: number;
	modelUsed: string | null;
	tokenUsage: { prompt: number; completion: number; total: number } | null;
}

const HISTORY_TURNS = 10;

export class AskQuestionUseCase {
	constructor(
		private readonly chats: ChatRepository,
		private readonly rag: RagPort,
		private readonly chatPipelines: ChatPipelineResolver,
		private readonly contextRetriever: ChatContextRetriever
	) {}

	async execute(command: AskQuestionCommand): Promise<AskQuestionResult> {
		const chat = await this.resolveChat(command);

		const history = await this.loadHistory(chat.id);

		// The user's message is persisted before the model call: it happened
		// regardless of whether generation succeeds, and a failed turn should
		// still be visible in the conversation history.
		await this.chats.createMessage({ id: randomUUID(), chatId: chat.id, role: 'user', content: command.question });

		// Retrieval + prompt assembly happen here, not inside the RocketRide
		// pipeline (see chat-pipeline.ts) — citations/confidence come from this
		// retrieval directly, not parsed back out of RocketRide's response.
		const context = await this.contextRetriever.retrieve(command.project, command.question);
		const citations = context.map((chunk) => ({ sourcePath: chunk.sourcePath, chunkId: chunk.chunkId, score: chunk.score }));
		const confidence = context[0]?.score ?? 0;

		const answer = await this.askWithRetry(command, history, context);

		const assistantMessage = await this.chats.createMessage({
			id: randomUUID(),
			chatId: chat.id,
			role: 'assistant',
			content: answer.answer,
			citations,
			latencyMs: answer.latencyMs,
			modelUsed: answer.modelUsed,
			tokensUsed: answer.tokenUsage?.total,
		});

		return {
			conversationId: chat.id,
			messageId: assistantMessage.id,
			answer: answer.answer,
			citations,
			confidence,
			retrievedDocuments: context.map((chunk) => ({ id: chunk.chunkId ?? chunk.sourcePath, sourcePath: chunk.sourcePath, score: chunk.score })),
			referencedCodeFiles: extractReferencedCodeFiles(citations),
			latencyMs: answer.latencyMs,
			modelUsed: answer.modelUsed ?? null,
			tokenUsage: answer.tokenUsage ?? null,
		};
	}

	/**
	 * RocketRide's `useExisting: true` resumes whatever pipeline instance is
	 * already running for a guid — if that instance died (engine restart,
	 * extension reload) our in-process token cache doesn't know and keeps
	 * handing out a token the engine no longer recognises, failing every call
	 * until the process restarts. One retry with the cache dropped self-heals
	 * that without surfacing a transient engine hiccup as a hard failure.
	 */
	private async askWithRetry(command: AskQuestionCommand, history: ChatHistoryTurn[], context: RetrievedChunk[]): Promise<ChatAnswer> {
		const prompt = buildRagPrompt(command.question, context);
		const pipelineToken = await this.chatPipelines.resolve(command.project);
		try {
			return await this.rag.ask(pipelineToken, { question: prompt, history });
		} catch {
			this.chatPipelines.invalidate(command.project);
			const freshToken = await this.chatPipelines.resolve(command.project);
			return await this.rag.ask(freshToken, { question: prompt, history });
		}
	}

	private async resolveChat(command: AskQuestionCommand) {
		if (!command.conversationId) {
			return this.chats.createChat({
				id: randomUUID(),
				projectId: command.project.id,
				title: command.question.slice(0, 120),
			});
		}

		const chat = await this.chats.findChatById(command.conversationId);
		// Cross-project conversation probing must look identical to a missing one.
		if (!chat || chat.projectId !== command.project.id) throw new ChatNotFoundError(command.conversationId);
		return chat;
	}

	private async loadHistory(chatId: string): Promise<ChatHistoryTurn[]> {
		const messages = await this.chats.listMessages(chatId, HISTORY_TURNS);
		return messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
	}
}
