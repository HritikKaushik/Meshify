import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { FileCode2, FileText, ArrowUp } from 'lucide-react';
import { api } from '@/api-client';
import type { ChatCitation, ChatResponse } from '@/api';
import { useAsync } from '@/ui';
import { useWorkspace } from '@/lib/workspace-context';
import { MeshAvatar, Kicker } from '@/components/mc/primitives';
import { TextGenerateEffect } from '@/components/ui/text-generate-effect';
import { cn } from '@/lib/utils';

interface Turn {
	role: 'user' | 'assistant';
	content: string;
	meta?: ChatResponse;
}

const CODE_EXT = /\.(ts|tsx|js|jsx|py|rs|go|java|rb|c|cc|cpp|h|hpp|cs|php|kt|swift|scala|sql|sh|yaml|yml|toml|json)$/i;

function isCodeSource(path: string): boolean {
	return CODE_EXT.test(path);
}

function confidenceLabel(c: number): string {
	if (c >= 0.7) return 'high confidence';
	if (c >= 0.4) return 'medium confidence';
	return 'low confidence';
}

const SUGGESTED = ['Summarize the ingested knowledge', 'What does this project do?', 'Where is authentication handled?'];

/**
 * Mesh Chat (design 2b) — the flagship RAG surface. Backed 1:1 by the real
 * synchronous /chat endpoint: citations, confidence, latency, model and token
 * usage all come straight from the response. The typing reveal on the latest
 * answer is a client-side effect played *after* the full response arrives —
 * the backend is synchronous, so this is not, and must never be dressed up as,
 * real token streaming.
 */
export function ChatPage() {
	const { project } = useWorkspace();
	const location = useLocation();
	const [question, setQuestion] = useState('');
	const [conversationId, setConversationId] = useState<string | undefined>(undefined);
	const [turns, setTurns] = useState<Turn[]>([]);
	const chat = useAsync<ChatResponse>();
	const threadRef = useRef<HTMLDivElement>(null);
	const kickoff = (location.state as { initialQuestion?: string } | null)?.initialQuestion;
	const kickedOff = useRef(false);

	const ask = (q: string) => {
		if (!q.trim() || chat.state.status === 'pending') return;
		setQuestion('');
		void chat.run(async () => {
			setTurns((t) => [...t, { role: 'user', content: q }]);
			const res = await api.chat(project.id, q, conversationId);
			setConversationId(res.conversationId);
			setTurns((t) => [...t, { role: 'assistant', content: res.answer, meta: res }]);
			return res;
		});
	};

	// Auto-send a question passed from the project home "Ask Mesh" composer.
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

	// Aggregate every cited source across the thread for the side panel.
	const sources = useMemo(() => {
		const map = new Map<string, ChatCitation>();
		for (const t of turns) {
			for (const c of t.meta?.citations ?? []) {
				const prev = map.get(c.sourcePath);
				if (!prev || c.score > prev.score) map.set(c.sourcePath, c);
			}
		}
		return [...map.values()].sort((a, b) => b.score - a.score);
	}, [turns]);

	return (
		<div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
			{/* Thread */}
			<div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-white/[.06] bg-mc-card/60">
				<div className="flex items-center gap-2.5 border-b border-white/[.06] px-5 py-3">
					<MeshAvatar size={24} />
					<span className="text-[13.5px] font-semibold text-mc-text">Mesh Chat</span>
					<span className="font-mono text-[11px] text-mc-muted">
						{project.name} · {sources.length} citation{sources.length === 1 ? '' : 's'}
					</span>
				</div>

				<div ref={threadRef} className="flex flex-1 flex-col items-center gap-6 overflow-y-auto px-6 py-7">
					<div className="flex w-full max-w-2xl flex-1 flex-col gap-6">
						{turns.length === 0 && chat.state.status !== 'pending' && (
							<div className="flex flex-col items-center gap-3 pt-16 text-center">
								<MeshAvatar size={40} breathe />
								<Kicker>// GROUNDED · CITED · SCOPED TO THIS PROJECT</Kicker>
								<p className="max-w-sm text-sm text-mc-text-3">
									Ask anything about {project.name}. Mesh answers only from this project's indexed documents and code, with sources.
								</p>
							</div>
						)}

						{turns.map((t, i) =>
							t.role === 'user' ? (
								<div key={i} className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm border border-white/[.07] bg-white/[.05] px-4 py-3">
									<p className="text-sm leading-relaxed text-mc-text">{t.content}</p>
								</div>
							) : (
								<MeshMessage key={i} turn={t} reveal={i === turns.length - 1} />
							)
						)}

						{chat.state.status === 'pending' && <StreamingIndicator />}
						{chat.state.status === 'error' && (
							<div className="rounded-lg border border-mc-danger/40 bg-mc-danger/10 px-4 py-3 text-sm text-mc-danger">
								{chat.state.error.message}
							</div>
						)}
					</div>

					{/* Composer */}
					<div className="sticky bottom-0 w-full max-w-2xl">
						{turns.length > 0 && (
							<div className="mb-2.5 flex flex-wrap gap-1.5">
								{SUGGESTED.slice(0, 3).map((s) => (
									<button
										key={s}
										onClick={() => ask(s)}
										className="rounded-full border border-white/[.08] bg-white/[.03] px-3 py-1.5 text-xs text-mc-text-2 transition-colors hover:border-mc-accent/40 hover:text-mc-text"
									>
										{s}
									</button>
								))}
							</div>
						)}
						<form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(question); }} className="rounded-[14px] p-px animate-aurora"
							style={{
								background: 'linear-gradient(120deg,rgba(240,178,106,.5),rgba(110,155,232,.35),rgba(240,178,106,.5))',
								backgroundSize: '200% 100%',
								boxShadow: '0 6px 26px rgba(227,154,76,.15)',
							}}
						>
							<div className="flex items-center gap-2.5 rounded-[13px] bg-[#0C0C11] px-4 py-3">
								<input
									value={question}
									onChange={(e) => setQuestion(e.target.value)}
									disabled={chat.state.status === 'pending'}
									placeholder={`Ask about ${project.name}…`}
									className="flex-1 bg-transparent text-sm text-mc-text placeholder:text-mc-muted focus:outline-none"
								/>
								<button
									type="submit"
									disabled={!question.trim() || chat.state.status === 'pending'}
									className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-mc-accent text-mc-bg shadow-[0_0_14px_rgba(227,154,76,.4)] transition-colors hover:bg-mc-accent-hi disabled:opacity-40"
								>
									<ArrowUp className="h-4 w-4" />
								</button>
							</div>
						</form>
						{conversationId && <p className="mt-2 text-center font-mono text-[11px] text-mc-muted">conversation {conversationId}</p>}
					</div>
				</div>
			</div>

			{/* Sources panel */}
			<aside className="hidden flex-col gap-2.5 lg:flex">
				<span className="px-1 font-mono text-[10.5px] tracking-[0.1em] text-mc-muted-2">SOURCES IN THIS THREAD</span>
				{sources.length === 0 && <p className="px-1 text-xs text-mc-text-3">Citations from Mesh's answers will appear here.</p>}
				{sources.map((c, i) => {
					const code = isCodeSource(c.sourcePath);
					return (
						<div
							key={c.sourcePath}
							className={cn(
								'flex flex-col gap-1.5 rounded-[10px] border p-3',
								i === 0 ? 'border-mc-accent/25 bg-mc-accent/[.06]' : 'border-white/[.06] bg-[rgba(18,18,24,.5)]'
							)}
						>
							<div className="flex items-center gap-2">
								{code ? <FileCode2 className="h-3.5 w-3.5 text-mc-teal" /> : <FileText className="h-3.5 w-3.5 text-mc-indexing" />}
								<span className="truncate font-mono text-xs text-mc-text">{c.sourcePath}</span>
							</div>
							<span className="font-mono text-[10.5px] text-mc-muted">
								score {c.score.toFixed(3)}
								{c.chunkId ? ` · chunk ${c.chunkId}` : ''}
							</span>
						</div>
					);
				})}
			</aside>
		</div>
	);
}

function MeshMessage({ turn, reveal }: { turn: Turn; reveal: boolean }) {
	const meta = turn.meta;
	const segments = meta ? Math.max(1, Math.round(meta.confidence * 4)) : 0;
	return (
		<div className="flex gap-3">
			<MeshAvatar size={28} breathe className="mt-0.5" />
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<div className="flex items-center gap-2.5">
					<span className="text-[12.5px] font-semibold text-mc-text">Mesh</span>
					{meta && (
						<div className="flex items-center gap-1.5">
							<div className="flex gap-0.5">
								{[0, 1, 2, 3].map((n) => (
									<span key={n} className="h-1 w-3 rounded-sm" style={{ background: n < segments ? '#55C784' : 'rgba(255,255,255,.1)' }} />
								))}
							</div>
							<span className="font-mono text-[10.5px] text-mc-muted">{confidenceLabel(meta.confidence)}</span>
						</div>
					)}
				</div>

				{reveal ? (
					<TextGenerateEffect words={turn.content} className="text-sm leading-relaxed text-mc-text-2" duration={0.25} />
				) : (
					<AnswerBody text={turn.content} />
				)}

				{meta && meta.citations.length > 0 && (
					<div className="flex flex-col gap-2 rounded-[11px] border border-white/[.06] bg-[rgba(18,18,24,.5)] p-3">
						<span className="font-mono text-[11px] tracking-[0.06em] text-mc-muted-2">{meta.citations.length} SOURCES</span>
						<div className="flex flex-wrap gap-1.5">
							{meta.citations.map((c, j) => {
								const code = isCodeSource(c.sourcePath);
								return (
									<span
										key={j}
										title={`score ${c.score.toFixed(3)}`}
										className="flex items-center gap-1.5 rounded-md border border-white/[.08] bg-white/[.03] px-2.5 py-1 font-mono text-[11.5px] text-mc-text-2"
									>
										{code ? <FileCode2 className="h-3 w-3 text-mc-teal" /> : <FileText className="h-3 w-3 text-mc-indexing" />}
										{c.sourcePath.split('/').pop()}
									</span>
								);
							})}
						</div>
					</div>
				)}

				{meta && (
					<div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-mc-muted">
						<span>{meta.latencyMs}ms</span>
						<span>·</span>
						<span>{meta.modelUsed ?? 'model n/a'}</span>
						{meta.tokenUsage && (
							<>
								<span>·</span>
								<span>{meta.tokenUsage.total} tokens</span>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

/** Renders answer text, promoting ```fenced``` spans to monospace code blocks. */
function AnswerBody({ text }: { text: string }) {
	const parts = text.split(/```/);
	return (
		<div className="flex flex-col gap-2.5 text-sm leading-relaxed text-mc-text-2">
			{parts.map((part, i) =>
				i % 2 === 1 ? (
					<pre
						key={i}
						className="overflow-x-auto rounded-lg border border-white/[.08] bg-[rgba(6,6,9,.6)] p-3.5 font-mono text-[12.5px] leading-relaxed text-mc-text-2"
					>
						{part.replace(/^[a-z]+\n/, '')}
					</pre>
				) : (
					part && (
						<p key={i} className="whitespace-pre-wrap">
							{part}
						</p>
					)
				)
			)}
		</div>
	);
}

function StreamingIndicator() {
	return (
		<div className="flex items-center gap-3">
			<MeshAvatar size={28} breathe className="!animate-breathe" />
			<span className="text-[12.5px] text-mc-text-3">Mesh is retrieving context…</span>
			<div className="flex gap-1">
				{[0, 1, 2].map((n) => (
					<span key={n} className="h-1.5 w-1.5 animate-meshpulse rounded-full bg-mc-accent" style={{ animationDelay: `${n * 0.2}s` }} />
				))}
			</div>
		</div>
	);
}
