import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ArrowUp, Star } from 'lucide-react';
import { api } from '@/api-client';
import type { ChatCitation, ChatMessage } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { MeshAvatar, Kicker } from '@/components/mc/primitives';
import { SuggestionChip } from '@/components/common/SuggestionChip';
import { MeshMessage, StreamingIndicator } from '@/components/chat/MeshMessage';
import { ContextRail } from '@/components/chat/ContextRail';
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
	const location = useLocation();
	const [params, setParams] = useSearchParams();
	const convParam = params.get('c');

	const [question, setQuestion] = useState('');
	const [conversationId, setConversationId] = useState<string | undefined>(undefined);
	const [turns, setTurns] = useState<Turn[]>([]);
	const chat = useAsync<unknown>();
	const history = useAsync<unknown>();
	const threadRef = useRef<HTMLDivElement>(null);
	const convRef = useRef<string | undefined>(undefined); // mirrors conversationId without re-triggering the load effect
	const kickoff = (location.state as { initialQuestion?: string } | null)?.initialQuestion;
	const kickedOff = useRef(false);

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

	// Auto-send a question handed over from the Overview "Ask Mesh" composer.
	useEffect(() => {
		if (kickoff && !kickedOff.current) {
			kickedOff.current = true;
			ask(kickoff);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [kickoff]);

	useEffect(() => {
		threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
	}, [turns, chat.state.status]);

	// Aggregate every cited source across the thread; latest confidence for the rail.
	const sources = useMemo(() => {
		const map = new Map<string, ChatCitation>();
		for (const t of turns) for (const c of t.citations ?? []) {
			const prev = map.get(c.sourcePath);
			if (!prev || c.score > prev.score) map.set(c.sourcePath, c);
		}
		return [...map.values()].sort((a, b) => b.score - a.score);
	}, [turns]);
	const latestConfidence = useMemo(() => [...turns].reverse().find((t) => t.confidence !== undefined)?.confidence, [turns]);

	const currentTitle = conversations.find((c) => c.id === conversationId)?.title;
	const related = conversations.filter((c) => c.id !== conversationId);

	return (
		<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
			{/* Thread */}
			<div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-black/[.06] bg-white shadow-[0_10px_30px_rgba(16,24,40,.06),0_1px_2px_rgba(16,24,40,.04)]">
				<div className="flex items-center gap-2.5 border-b border-black/[.06] px-5 py-3">
					{conversationId ? <Star className="h-3.5 w-3.5 fill-current text-mc-accent" /> : <MeshAvatar size={24} />}
					<span className="truncate text-[13.5px] font-semibold text-mc-text">{currentTitle ?? (conversationId ? 'Conversation' : 'New conversation')}</span>
					<span className="font-mono text-[11px] text-mc-muted">
						{project.name} · {sources.length} citation{sources.length === 1 ? '' : 's'}
					</span>
				</div>

				<div ref={threadRef} className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-7">
					<div className="flex w-full max-w-2xl flex-1 flex-col gap-6">
						{turns.length === 0 && chat.state.status !== 'pending' && history.state.status !== 'pending' && (
							<div className="flex flex-col items-center gap-3 pt-16 text-center">
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
								<div key={i} className="ml-auto max-w-[80%] rounded-[18px] rounded-br-md bg-[#EEF2FB] px-4 py-3">
									<p className="text-[14.5px] leading-relaxed text-mc-text-2">{t.content}</p>
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

					{/* Composer */}
					<div className="sticky bottom-0 w-full max-w-2xl">
						{turns.length > 0 && (
							<div className="mb-2.5 flex flex-wrap gap-1.5">
								{SUGGESTED.slice(0, 3).map((s) => (
									<SuggestionChip key={s} onClick={() => ask(s)}>
										{s}
									</SuggestionChip>
								))}
							</div>
						)}
						<form
							onSubmit={(e: FormEvent) => { e.preventDefault(); ask(question); }}
							className="flex items-center gap-3 rounded-[18px] border border-black/[.09] bg-white px-4 py-3 shadow-[0_12px_36px_rgba(16,24,40,.1),0_2px_8px_rgba(16,24,40,.05)] transition-colors focus-within:border-mc-accent/40"
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
								className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-mc-accent text-white shadow-[0_4px_12px_rgba(26,115,232,.3)] transition-colors hover:bg-mc-accent-hi disabled:opacity-40"
							>
								<ArrowUp className="h-4 w-4" />
							</button>
						</form>
					</div>
				</div>
			</div>

			<ContextRail confidence={latestConfidence} sources={sources} related={related} projectId={project.id} />
		</div>
	);
}
