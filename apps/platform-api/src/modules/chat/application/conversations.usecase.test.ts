import { describe, expect, it, vi } from 'vitest';
import type { Chat, ChatRepository, ChatSummary, Message } from '@meshify/data-access';
import { ChatNotFoundError } from './ask-question.usecase.js';
import { ListConversationsUseCase } from './list-conversations.usecase.js';
import { UpdateConversationUseCase } from './update-conversation.usecase.js';
import { DeleteConversationUseCase } from './delete-conversation.usecase.js';
import { GetConversationMessagesUseCase } from './get-conversation-messages.usecase.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT = '22222222-2222-4222-8222-222222222222';

function chat(overrides: Partial<Chat> = {}): Chat {
	return { id: 'chat-1', projectId: PROJECT_ID, userId: null, title: 'Refund retry logic', pinned: false, createdAt: new Date('2026-01-01T00:00:00Z'), ...overrides };
}

function makeRepo(seed?: Chat) {
	const deleted: string[] = [];
	const repo = {
		findChatById: vi.fn(async (id: string) => (seed && seed.id === id ? seed : undefined)),
		findByProjectId: vi.fn(async () => [{ ...chat(), messageCount: 3 }] as ChatSummary[]),
		updateChat: vi.fn(async (id: string, patch: { title?: string; pinned?: boolean }) => (seed && seed.id === id ? { ...seed, ...patch } : undefined)),
		deleteChat: vi.fn(async (id: string) => {
			deleted.push(id);
		}),
		listMessages: vi.fn(async () => [{ id: 'm1' }] as unknown as Message[]),
	};
	return { repo: repo as unknown as ChatRepository, raw: repo, deleted };
}

describe('conversation use cases', () => {
	it('ListConversations returns the project conversations', async () => {
		const { repo } = makeRepo();
		const result = await new ListConversationsUseCase(repo).execute(PROJECT_ID);
		expect(result).toHaveLength(1);
		expect(result[0]!.messageCount).toBe(3);
	});

	it('UpdateConversation applies the patch to an owned conversation', async () => {
		const { repo, raw } = makeRepo(chat());
		const updated = await new UpdateConversationUseCase(repo).execute({ projectId: PROJECT_ID, chatId: 'chat-1', patch: { pinned: true } });
		expect(updated.pinned).toBe(true);
		expect(raw.updateChat).toHaveBeenCalledWith('chat-1', { pinned: true });
	});

	it('UpdateConversation rejects a cross-project conversation exactly like a missing one', async () => {
		const { repo, raw } = makeRepo(chat({ projectId: OTHER_PROJECT }));
		await expect(new UpdateConversationUseCase(repo).execute({ projectId: PROJECT_ID, chatId: 'chat-1', patch: { pinned: true } })).rejects.toBeInstanceOf(ChatNotFoundError);
		expect(raw.updateChat).not.toHaveBeenCalled();
	});

	it('DeleteConversation removes an owned conversation and 404s across projects', async () => {
		const owned = makeRepo(chat());
		await new DeleteConversationUseCase(owned.repo).execute({ projectId: PROJECT_ID, chatId: 'chat-1' });
		expect(owned.deleted).toEqual(['chat-1']);

		const foreign = makeRepo(chat({ projectId: OTHER_PROJECT }));
		await expect(new DeleteConversationUseCase(foreign.repo).execute({ projectId: PROJECT_ID, chatId: 'chat-1' })).rejects.toBeInstanceOf(ChatNotFoundError);
		expect(foreign.deleted).toHaveLength(0);
	});

	it('GetConversationMessages returns the chat + messages for an owned conversation', async () => {
		const { repo, raw } = makeRepo(chat());
		const result = await new GetConversationMessagesUseCase(repo).execute({ projectId: PROJECT_ID, chatId: 'chat-1' });
		expect(result.chat.id).toBe('chat-1');
		expect(result.messages).toHaveLength(1);
		expect(raw.listMessages).toHaveBeenCalledWith('chat-1', 200);
	});

	it('GetConversationMessages 404s a missing conversation without reading messages', async () => {
		const { repo, raw } = makeRepo(undefined);
		await expect(new GetConversationMessagesUseCase(repo).execute({ projectId: PROJECT_ID, chatId: 'nope' })).rejects.toBeInstanceOf(ChatNotFoundError);
		expect(raw.listMessages).not.toHaveBeenCalled();
	});
});
