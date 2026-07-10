import { describe, expect, it } from 'vitest';
import type { Chat, ChatRepository, Message, Project } from '@meshify/data-access';
import { FakeRagService } from '@meshify/rocketride-gateway';
import { AskQuestionUseCase, ChatNotFoundError } from './ask-question.usecase.js';
import type { ChatPipelineResolver } from './chat-pipeline.port.js';

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
		const chat: Chat = { id: input.id, projectId: input.projectId, userId: input.userId ?? null, title: input.title ?? null, createdAt: new Date() };
		this.chats.set(chat.id, chat);
		return chat;
	}

	async findChatById(id: string): Promise<Chat | undefined> {
		return this.chats.get(id);
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

const fakeResolver: ChatPipelineResolver = { resolve: async () => 'pipeline-token-1' };

describe('AskQuestionUseCase', () => {
	it('creates a conversation on first question and returns the full contract', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		rag.nextAnswer = {
			answer: 'It uses BullMQ.',
			citations: [
				{ sourcePath: 'src/queue.ts', chunkId: 'c1', score: 0.91 },
				{ sourcePath: 'docs/Architecture.md', chunkId: 'c2', score: 0.85 },
			],
			retrievedDocuments: [{ id: 'c1', sourcePath: 'src/queue.ts', score: 0.91 }],
			confidence: 0.91,
			latencyMs: 640,
			modelUsed: 'gpt-4-turbo',
			tokenUsage: { prompt: 900, completion: 120, total: 1020 },
		};
		const usecase = new AskQuestionUseCase(chats, rag, fakeResolver);

		const result = await usecase.execute({ project: PROJECT, question: 'Which queue library is used?' });

		expect(result.conversationId).toBeDefined();
		expect(result.answer).toBe('It uses BullMQ.');
		expect(result.confidence).toBe(0.91);
		expect(result.referencedCodeFiles).toEqual(['src/queue.ts']); // Architecture.md is prose, filtered out
		expect(result.modelUsed).toBe('gpt-4-turbo');
		expect(result.tokenUsage?.total).toBe(1020);
		// Both sides of the turn persisted, assistant message carrying the metadata.
		expect(chats.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
		expect(chats.messages[1]!.citations).toHaveLength(2);
		expect(chats.messages[1]!.latencyMs).toBe(640);
		expect(rag.askCalls[0]!.pipelineToken).toBe('pipeline-token-1');
	});

	it('passes prior turns as history on a follow-up question', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		const usecase = new AskQuestionUseCase(chats, rag, fakeResolver);

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
		const usecase = new AskQuestionUseCase(chats, new FakeRagService(), fakeResolver);

		await expect(usecase.execute({ project: PROJECT, conversationId: 'other-chat', question: 'hi' })).rejects.toBeInstanceOf(ChatNotFoundError);
		await expect(usecase.execute({ project: PROJECT, conversationId: 'missing', question: 'hi' })).rejects.toBeInstanceOf(ChatNotFoundError);
	});

	it('keeps the user message when generation fails, and does not write an assistant message', async () => {
		const chats = new FakeChatRepository();
		const rag = new FakeRagService();
		rag.ask = async () => {
			throw new Error('Failed to connect to ws://rocketride');
		};
		const usecase = new AskQuestionUseCase(chats, rag, fakeResolver);

		await expect(usecase.execute({ project: PROJECT, question: 'Will this fail?' })).rejects.toThrow(/Failed to connect/);
		expect(chats.messages.map((m) => m.role)).toEqual(['user']);
	});
});
