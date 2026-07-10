import { Router } from 'express';
import { z } from 'zod';
import type { ChatRepository } from '@meshify/data-access';
import type { GetProjectUseCase } from '../../projects/application/get-project.usecase.js';
import { projectIsolationGuard } from '../../projects/interface/project-isolation.guard.js';
import type { AskQuestionUseCase } from '../application/ask-question.usecase.js';
import { ChatNotFoundError } from '../application/ask-question.usecase.js';

const askSchema = z.object({
	conversationId: z.string().uuid().optional(),
	question: z.string().min(1).max(8000),
});

export function createChatController(deps: { getProject: GetProjectUseCase; askQuestion: AskQuestionUseCase; chats: ChatRepository }): Router {
	const router = Router();
	const guard = projectIsolationGuard(deps.getProject);

	router.post('/v1/projects/:projectId/chat', guard, async (req, res) => {
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

	router.get('/v1/projects/:projectId/chats/:chatId/messages', guard, async (req, res) => {
		const chatId = req.params.chatId as string;
		const chat = await deps.chats.findChatById(chatId);
		if (!chat || chat.projectId !== req.project!.id) {
			res.status(404).json({ error: `Conversation "${chatId}" not found` });
			return;
		}

		const messages = await deps.chats.listMessages(chatId, 200);
		res.status(200).json({
			conversationId: chat.id,
			messages: messages.map((m) => ({
				id: m.id,
				role: m.role,
				content: m.content,
				citations: m.citations,
				latencyMs: m.latencyMs,
				modelUsed: m.modelUsed,
				tokensUsed: m.tokensUsed,
				createdAt: m.createdAt.toISOString(),
			})),
		});
	});

	return router;
}
