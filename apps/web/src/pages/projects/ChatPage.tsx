import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { api } from '@/api-client';
import type { ChatMessage } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { MeshAvatar, Kicker } from '@/components/mc/primitives';
import { SuggestionChip } from '@/components/common/SuggestionChip';
import { MeshMessage, StreamingIndicator } from '@/components/chat/MeshMessage';
import type { Turn } from '@/components/chat/chat-util';

const SUGGESTED = ['Summarize the ingested knowledge', 'What does this project do?', 'Where is authentication handled?'];

/** Map a persisted message into a render Turn (history has no confidence). */
function toTurn(m: ChatMessage): Turn {
	return m.role === 'user'
		? { role: 'user', content: m.content }
		: { role: 'assistant', content: m.content, citations: m.citations, latencyMs: m.latencyMs, modelUsed: m.modelUsed, tokensTotal: m.tokensUsed };
}

/**
 * Mesh Chat (design 3d) — the primary project experience. Conversation-aware:
 * the active conversation is the `?c=` URL param, so the sidebar drives which
 * thread is shown; history loads from GET …/messages, and the sidebar refreshes
 * after each send. Backed 1:1 by the real synchronous /chat endpoint — the
 * typing reveal on a freshly-sent answer is a client-side effect, never fake
 * token streaming.
 */
export function ChatPage() {
	const { project, conversations, refreshConversations } = useWorkspace();
	const [params, setParams] = useSearchParams();
	const convParam = params.get('c');

	const [question, setQuestion] = useState('');
	const [conversationId, setConversationId] = useState<string | undefined>(undefined);
	const [turns, setTurns] = useState<Turn[]>([]);
	const chat = useAsync<unknown>();
	const history = useAsync<unknown>();
	const threadRef = useRef<HTMLDivElement>(null);
	const convRef = useRef<string | undefined>(undefined); // mirrors conversationId without re-triggering the load effect

	const ask = (q: string) => {
		if (!q.trim() || chat.state.status === 'pending') return;
		setQuestion('');
		void chat.run(async () => {
			setTurns((t) => [...t, { role: 'user', content: q }]);
			const wasNew = !convRef.current;
			const res = await api.chat(project.id, q, convRef.current);
			convRef.current = res.conversationId;
			setConversationId(res.conversationId);
			setTurns((t) => [
				...t,
				{ role: 'assistant', content: res.answer, live: true, confidence: res.confidence, citations: res.citations, latencyMs: res.latencyMs, modelUsed: res.modelUsed, tokensTotal: res.tokenUsage?.total ?? null },
			]);
			// Reflect a brand-new conversation in the URL (shareable) — the load
			// effect skips reloading because convRef already points at it.
			if (wasNew) setParams({ c: res.conversationId }, { replace: true });
			void refreshConversations();
			return res;
		});
	};

	// Switch conversations when the ?c= param changes (sidebar clicks, New Conversation).
	useEffect(() => {
		if (convParam === convRef.current) return;
		if (!convParam) {
			convRef.current = undefined;
			setConversationId(undefined);
			setTurns([]);
			return;
		}
		convRef.current = convParam;
		setConversationId(convParam);
		setTurns([]);
		void history.run(async () => {
			const msgs = await api.getMessages(project.id, convParam);
			setTurns(msgs.filter((m) => m.role !== 'system').map(toTurn));
			return msgs;
		});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [convParam, project.id]);

	useEffect(() => {
		threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
	}, [turns, chat.state.status]);

	// Aggregate every cited source across the thread for the header count.
	const sources = useMemo(() => {
		const seen = new Set<string>();
		for (const t of turns) for (const c of t.citations ?? []) seen.add(c.sourcePath);
		return seen;
	}, [turns]);

	const currentTitle = conversations.find((c) => c.id === conversationId)?.title;

	return (
		<div className="flex h-full flex-col">
			{/* Reading column — fills the main area, centered ~760px (design 4c) */}
			<div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-6 px-5 pb-6 pt-9 sm:px-10">
					{/* Conversation title (scrolls with the thread) */}
					{turns.length > 0 && (
						<div className="flex flex-col gap-1">
							<h1 className="text-[22px] font-semibold tracking-[-.02em] text-mc-text">{currentTitle ?? (conversationId ? 'Conversation' : 'New conversation')}</h1>
							<div className="text-[12px] text-mc-muted-2">
								{sources.size} source{sources.size === 1 ? '' : 's'} · {project.name}
							</div>
						</div>
					)}

					{turns.length === 0 && chat.state.status !== 'pending' && history.state.status !== 'pending' && (
						<div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
							<MeshAvatar size={40} breathe />
							<Kicker className="text-mc-accent">// GROUNDED · CITED · SCOPED TO THIS PROJECT</Kicker>
							<p className="max-w-sm text-sm text-mc-text-3">
								Ask anything about {project.name}. Mesh answers only from this project's indexed documents and code, with sources.
							</p>
						</div>
					)}

					{history.state.status === 'pending' && <p className="pt-10 text-center text-sm text-mc-text-3">Loading conversation…</p>}

					{turns.map((t, i) =>
						t.role === 'user' ? (
							<div key={i} className="ml-auto max-w-[80%] rounded-[18px] rounded-br-md border border-mc-accent/20 bg-mc-accent/[.12] px-4 py-3">
								<p className="text-[14.5px] leading-relaxed text-mc-text">{t.content}</p>
							</div>
						) : (
							<MeshMessage key={i} turn={t} reveal={i === turns.length - 1 && !!t.live} />
						)
					)}

					{chat.state.status === 'pending' && <StreamingIndicator />}
					{chat.state.status === 'error' && (
						<div className="rounded-xl border border-mc-danger/30 bg-mc-danger/[.07] px-4 py-3 text-sm text-mc-danger">{(chat.state.error as Error).message}</div>
					)}
				</div>
			</div>

			{/* Floating composer — fades into the canvas at the bottom of the column */}
			<div className="flex-none px-5 pb-6 pt-3 sm:px-10" style={{ background: 'linear-gradient(0deg, hsl(var(--mc-bg)) 62%, transparent)' }}>
				<div className="mx-auto w-full max-w-3xl">
					{turns.length > 0 && (
						<div className="mb-3 flex flex-wrap gap-1.5">
							{SUGGESTED.slice(0, 3).map((s) => (
								<SuggestionChip key={s} onClick={() => ask(s)}>
									{s}
								</SuggestionChip>
							))}
						</div>
					)}
					<form
						onSubmit={(e: FormEvent) => { e.preventDefault(); ask(question); }}
						className="flex items-center gap-3 rounded-[18px] border border-mc-border bg-mc-card px-4 py-3 shadow-e3 transition-colors focus-within:border-mc-accent/40"
					>
						<input
							value={question}
							onChange={(e) => setQuestion(e.target.value)}
							disabled={chat.state.status === 'pending'}
							placeholder={`Ask about ${project.name}…`}
							className="flex-1 bg-transparent text-[14.5px] text-mc-text placeholder:text-mc-muted focus:outline-none"
						/>
						<button
							type="submit"
							disabled={!question.trim() || chat.state.status === 'pending'}
							className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-xl bg-mc-accent text-white shadow-glow-accent transition-colors hover:bg-mc-accent-hi disabled:opacity-40"
						>
							<ArrowUp className="h-4 w-4" />
						</button>
					</form>
				</div>
			</div>
		</div>
	);
}
