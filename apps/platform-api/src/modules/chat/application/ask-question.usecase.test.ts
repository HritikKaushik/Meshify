import { describe, expect, it } from 'vitest';
import type { Chat, ChatRepository, ChatSummary, Message, Project } from '@meshify/data-access';
import { FakeRagService, RocketRidePipelineTimeoutError } from '@meshify/rocketride-gateway';
import { AskQuestionUseCase, ChatNotFoundError } from './ask-question.usecase.js';
import type { ChatPipelineResolver } from './chat-pipeline.port.js';
import type { ChatContextRetriever } from './chat-context-retriever.port.js';
import type { RetrievedChunk } from '../domain/build-rag-prompt.js';

const PROJECT = {
	id: '11111111-1111-4111-8111-111111111111',
	rocketrideChatPipelineId: '22222222-2222-4222-8222-222222222222',
	llmProfile: 'openai-5',
	embeddingProfile: 'text-embedding-3-large',
	qdrantCollectionDocs: 'proj_x_documents',
	qdrantCollectionCode: 'proj_x_code',
} as unknown as Project;

class FakeChatRepository implements ChatRepository {
	chats = new Map<string, Chat>();
	messages: Message[] = [];

	async createChat(input: { id: string; projectId: string; userId?: string; title?: string }): Promise<Chat> {
		const chat: Chat = { id: input.id, projectId: input.projectId, userId: input.userId ?? null, title: input.title ?? null, pinned: false, createdAt: new Date() };
		this.chats.set(chat.id, chat);
		return chat;
	}

	async findChatById(id: string): Promise<Chat | undefined> {
		return this.chats.get(id);
	}

	async findByProjectId(projectId: string): Promise<ChatSummary[]> {
		return [...this.chats.values()]
			.filter((c) => c.projectId === projectId)
			.map((c) => ({ ...c, messageCount: this.messages.filter((m) => m.chatId === c.id).length }));
	}

	async updateChat(id: string, patch: { title?: string; pinned?: boolean }): Promise<Chat | undefined> {
		const chat = this.chats.get(id);
		if (!chat) return undefined;
		const updated = { ...chat, ...patch };
		this.chats.set(id, updated);
		return updated;
	}

	async deleteChat(id: string): Promise<void> {
		this.chats.delete(id);
		this.messages = this.messages.filter((m) => m.chatId !== id);
	}

	async countByProject(projectId: string): Promise<number> {
		return [...this.chats.values()].filter((c) => c.projectId === projectId).length;
	}

	async createMessage(input: { id: string; chatId: string; role: Message['role']; content: string; citations?: Message['citations']; latencyMs?: number; modelUsed?: string; tokensUsed?: number }): Promise<Message> {
		const message: Message = {
			id: input.id,
			chatId: input.chatId,
			role: input.role,
			content: input.content,
			citations: input.citations ?? [],
			latencyMs: input.latencyMs ?? null,
			modelUsed: input.modelUsed ?? null,
			tokensUsed: input.tokensUsed ?? null,
			createdAt: new Date(),
		};
		this.messages.push(message);
		return message;
	}

	async listMessages(chatId: string, limit = 50): Promise<Message[]> {
		return this.messages.filter((m) => m.chatId === chatId).slice(-limit);
	}
}

const fakeResolver: ChatPipelineResolver = { resolve: async () => 'pipeline-token-1', invalidate: () => {} };

const NO_CONTEXT: ChatContextRetriever = { retrieve: async () => [] };

function retrieverReturning(chunks: RetrievedChunk[]): ChatContextRetriever {
	return { retrieve: async () => chunks };
}

describe('AskQuestionUseCase', () => {
	it('creates a conversation on first question and returns the full contract', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		rag.nextAnswer = {
			answer: 'It uses BullMQ.',
			latencyMs: 640,
			modelUsed: 'gpt-4-turbo',
			tokenUsage: { prompt: 900, completion: 120, total: 1020 },
		};
		const context = retrieverReturning([
			{ sourcePath: 'src/queue.ts', content: 'BullMQ setup...', score: 0.91, chunkId: 'c1' },
			{ sourcePath: 'docs/Architecture.md', content: 'Architecture prose...', score: 0.85, chunkId: 'c2' },
		]);
		const usecase = new AskQuestionUseCase(chats, rag, fakeResolver, context);

		const result = await usecase.execute({ project: PROJECT, question: 'Which queue library is used?' });

		expect(result.conversationId).toBeDefined();
		expect(result.answer).toBe('It uses BullMQ.');
		expect(result.confidence).toBe(0.91);
		expect(result.citations).toEqual([
			{ sourcePath: 'src/queue.ts', chunkId: 'c1', score: 0.91 },
			{ sourcePath: 'docs/Architecture.md', chunkId: 'c2', score: 0.85 },
		]);
		expect(result.referencedCodeFiles).toEqual(['src/queue.ts']); // Architecture.md is prose, filtered out
		expect(result.modelUsed).toBe('gpt-4-turbo');
		expect(result.tokenUsage?.total).toBe(1020);
		// Both sides of the turn persisted, assistant message carrying the metadata.
		expect(chats.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
		expect(chats.messages[1]!.citations).toHaveLength(2);
		expect(chats.messages[1]!.latencyMs).toBe(640);
		expect(rag.askCalls[0]!.pipelineToken).toBe('pipeline-token-1');
		// The retrieved context is folded into the question sent to RocketRide.
		expect(rag.askCalls[0]!.turn.question).toContain('src/queue.ts');
		expect(rag.askCalls[0]!.turn.question).toContain('Which queue library is used?');
	});

	it('passes prior turns as history on a follow-up question', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		const usecase = new AskQuestionUseCase(chats, rag, fakeResolver, NO_CONTEXT);

		const first = await usecase.execute({ project: PROJECT, question: 'What is Meshify?' });
		await usecase.execute({ project: PROJECT, conversationId: first.conversationId, question: 'How does it isolate projects?' });

		const secondCall = rag.askCalls[1]!;
		expect(secondCall.turn.history).toEqual([
			{ role: 'user', content: 'What is Meshify?' },
			{ role: 'assistant', content: 'This is a fake answer.' },
		]);
	});

	it('rejects a conversation belonging to another project exactly like a missing one', async () => {
		const chats = new FakeChatRepository();
		await chats.createChat({ id: 'other-chat', projectId: 'some-other-project' });
		const usecase = new AskQuestionUseCase(chats, new FakeRagService(), fakeResolver, NO_CONTEXT);

		await expect(usecase.execute({ project: PROJECT, conversationId: 'other-chat', question: 'hi' })).rejects.toBeInstanceOf(ChatNotFoundError);
		await expect(usecase.execute({ project: PROJECT, conversationId: 'missing', question: 'hi' })).rejects.toBeInstanceOf(ChatNotFoundError);
	});

	it('keeps the user message when generation fails, and does not write an assistant message', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		rag.ask = async () => {
			throw new Error('Failed to connect to ws://rocketride');
		};
		const usecase = new AskQuestionUseCase(chats, rag, fakeResolver, NO_CONTEXT);

		await expect(usecase.execute({ project: PROJECT, question: 'Will this fail?' })).rejects.toThrow(/Failed to connect/);
		expect(chats.messages.map((m) => m.role)).toEqual(['user']);
	});

	it('self-heals a stale pipeline token: invalidates and retries once before giving up', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		let calls = 0;
		rag.ask = async () => {
			calls += 1;
			if (calls === 1) throw new Error('AI engine could not be reached');
			return { answer: 'Recovered.', latencyMs: 10, modelUsed: null, tokenUsage: null };
		};
		const invalidateCalls: string[] = [];
		const resolver: ChatPipelineResolver = {
			resolve: async () => 'pipeline-token-1',
			invalidate: (project) => invalidateCalls.push(project.id),
		};
		const usecase = new AskQuestionUseCase(chats, rag, resolver, NO_CONTEXT);

		const result = await usecase.execute({ project: PROJECT, question: 'Retry me' });

		expect(result.answer).toBe('Recovered.');
		expect(calls).toBe(2);
		expect(invalidateCalls).toEqual([PROJECT.id]);
		expect(chats.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
	});

	it('does not retry a timed-out engine call (a second unbounded wait is not a self-heal)', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		let calls = 0;
		rag.ask = async () => {
			calls += 1;
			throw new RocketRidePipelineTimeoutError('chat', 5);
		};
		let invalidateCount = 0;
		const resolver: ChatPipelineResolver = {
			resolve: async () => 'pipeline-token-1',
			invalidate: () => {
				invalidateCount += 1;
			},
		};
		const usecase = new AskQuestionUseCase(chats, rag, resolver, NO_CONTEXT);

		await expect(usecase.execute({ project: PROJECT, question: 'Slow?' })).rejects.toBeInstanceOf(RocketRidePipelineTimeoutError);
		expect(calls).toBe(1);
		expect(invalidateCount).toBe(0);
	});

	it('propagates the error when the retry also fails, without a second invalidate', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		rag.ask = async () => {
			throw new Error('still down');
		};
		let invalidateCount = 0;
		const resolver: ChatPipelineResolver = {
			resolve: async () => 'pipeline-token-1',
			invalidate: () => {
				invalidateCount += 1;
			},
		};
		const usecase = new AskQuestionUseCase(chats, rag, resolver, NO_CONTEXT);

		await expect(usecase.execute({ project: PROJECT, question: 'Will this fail?' })).rejects.toThrow(/still down/);
		expect(invalidateCount).toBe(1);
		expect(chats.messages.map((m) => m.role)).toEqual(['user']);
	});
});
