import type { Router } from 'express';
import { requireUuidParams } from '../../../http/require-uuid-params.js';
import { createRouter } from '../../../http/router.js';
import type { Authorizer } from '../../security/authorization/authorizer.js';
import { z } from 'zod';
import type { Chat, ChatSummary, Message } from '@meshify/data-access';
import type { AskQuestionUseCase } from '../application/ask-question.usecase.js';
import { ChatNotFoundError } from '../application/ask-question.usecase.js';
import type { ListConversationsUseCase } from '../application/list-conversations.usecase.js';
import type { UpdateConversationUseCase } from '../application/update-conversation.usecase.js';
import type { DeleteConversationUseCase } from '../application/delete-conversation.usecase.js';
import type { GetConversationMessagesUseCase } from '../application/get-conversation-messages.usecase.js';

const askSchema = z.object({
	conversationId: z.string().uuid().optional(),
	question: z.string().min(1).max(8000),
});

const updateChatSchema = z
	.object({
		title: z.string().min(1).max(200).optional(),
		pinned: z.boolean().optional(),
	})
	.refine((v) => v.title !== undefined || v.pinned !== undefined, { message: 'Provide at least one of: title, pinned' });

function toConversationSummary(c: ChatSummary) {
	return { id: c.id, title: c.title, pinned: c.pinned, messageCount: c.messageCount, createdAt: c.createdAt.toISOString() };
}

function toConversation(c: Chat) {
	return { id: c.id, title: c.title, pinned: c.pinned, createdAt: c.createdAt.toISOString() };
}

function toMessage(m: Message) {
	return {
		id: m.id,
		role: m.role,
		content: m.content,
		citations: m.citations,
		latencyMs: m.latencyMs,
		modelUsed: m.modelUsed,
		tokensUsed: m.tokensUsed,
		confidence: m.confidence,
		createdAt: m.createdAt.toISOString(),
	};
}

export function createChatController(deps: {
	authz: Authorizer;
	askQuestion: AskQuestionUseCase;
	listConversations: ListConversationsUseCase;
	updateConversation: UpdateConversationUseCase;
	deleteConversation: DeleteConversationUseCase;
	getConversationMessages: GetConversationMessagesUseCase;
}): Router {
	const router = createRouter();
	const { authorize } = deps.authz;

	router.post('/v1/projects/:projectId/chat', authorize('chat:write'), async (req, res) => {
		const parsed = askSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}

		try {
			const result = await deps.askQuestion.execute({
				project: req.project!,
				conversationId: parsed.data.conversationId,
				question: parsed.data.question,
				userId: req.auth!.userId,
			});
			res.status(200).json(result);
		} catch (err) {
			if (err instanceof ChatNotFoundError) {
				res.status(404).json({ error: err.message });
				return;
			}
			req.log?.error({ err }, 'chat request failed');
			// The AI engine being unreachable is an upstream failure, not a client error.
			res.status(502).json({ error: 'Chat is temporarily unavailable — the AI engine could not be reached' });
		}
	});

	// List a project's conversations (pinned first, then newest) for the workspace sidebar.
	router.get('/v1/projects/:projectId/chats', authorize('chat:read'), async (req, res) => {
		const conversations = await deps.listConversations.execute(req.project!.id);
		res.status(200).json({ conversations: conversations.map(toConversationSummary) });
	});

	// Pin/unpin or rename a conversation.
	router.patch('/v1/projects/:projectId/chats/:chatId', authorize('chat:write'), requireUuidParams('chatId'), async (req, res) => {
		const parsed = updateChatSchema.safeParse(req.body);
		if (!parsed.success) {
			res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
			return;
		}
		const chatId = req.params.chatId as string;
		try {
			const updated = await deps.updateConversation.execute({ projectId: req.project!.id, chatId, patch: parsed.data });
			res.status(200).json(toConversation(updated));
		} catch (err) {
			if (err instanceof ChatNotFoundError) {
				res.status(404).json({ error: `Conversation "${chatId}" not found` });
				return;
			}
			throw err;
		}
	});

	// Delete a conversation (and, via ON DELETE CASCADE, its messages).
	router.delete('/v1/projects/:projectId/chats/:chatId', authorize('chat:write'), requireUuidParams('chatId'), async (req, res) => {
		const chatId = req.params.chatId as string;
		try {
			await deps.deleteConversation.execute({ projectId: req.project!.id, chatId });
			res.status(204).send();
		} catch (err) {
			if (err instanceof ChatNotFoundError) {
				res.status(404).json({ error: `Conversation "${chatId}" not found` });
				return;
			}
			throw err;
		}
	});

	router.get('/v1/projects/:projectId/chats/:chatId/messages', authorize('chat:read'), requireUuidParams('chatId'), async (req, res) => {
		const chatId = req.params.chatId as string;
		try {
			const { chat, messages } = await deps.getConversationMessages.execute({ projectId: req.project!.id, chatId });
			res.status(200).json({ conversationId: chat.id, messages: messages.map(toMessage) });
		} catch (err) {
			if (err instanceof ChatNotFoundError) {
				res.status(404).json({ error: `Conversation "${chatId}" not found` });
				return;
			}
			throw err;
		}
	});

	return router;
}
