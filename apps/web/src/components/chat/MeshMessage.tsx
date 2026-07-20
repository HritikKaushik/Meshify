import { FileCode2, FileText, MessagesSquare } from 'lucide-react';
import { MeshAvatar } from '@/components/mc/primitives';
import { TypewriterEffect } from '@/components/ui/typewriter-effect';
import { type Turn, isCodeSource, confidenceLabel } from './chat-util';
import { cn } from '@/lib/utils';

/**
 * A Mesh (assistant) message: confidence meter (live answers only), the answer
 * body with code-block rendering, inline citation chips, and latency/model/token
 * metadata. `reveal` plays a client-side typewriter reveal on a freshly-sent
 * answer only — never on replayed history, and never a fake streaming progress
 * bar (the /chat endpoint is synchronous).
 */
export function MeshMessage({ turn, reveal }: { turn: Turn; reveal: boolean }) {
	const segments = turn.confidence !== undefined ? Math.max(1, Math.round(turn.confidence * 4)) : 0;
	const citations = turn.citations ?? [];
	return (
		<div className="flex gap-3">
			<MeshAvatar size={28} breathe className="mt-0.5" />
			<div className="flex min-w-0 flex-1 flex-col gap-3">
				<div className="flex items-center gap-2.5">
					<span className="text-[12.5px] font-semibold text-mc-text">Mesh</span>
					{turn.confidence !== undefined && (
						<div className="flex items-center gap-1.5">
							<div className="flex gap-0.5">
								{[0, 1, 2, 3].map((n) => (
									<span key={n} className="h-1 w-3 rounded-sm" style={{ background: n < segments ? 'hsl(var(--mc-success))' : 'hsl(var(--mc-muted) / 0.28)' }} />
								))}
							</div>
							<span className="font-mono text-[10.5px] text-mc-muted">{confidenceLabel(turn.confidence)}</span>
						</div>
					)}
				</div>

				{reveal ? (
					<TypewriterEffect
						words={turn.content.split(' ').map((text) => ({ text }))}
						className="text-[15px] leading-relaxed text-mc-text-2"
						duration={0.15}
						stagger={0.012}
					/>
				) : (
					<AnswerBody text={turn.content} />
				)}

				{citations.length > 0 && (
					<div className="flex flex-col gap-2 rounded-xl border border-mc-hairline bg-mc-surface p-3">
						<span className="font-mono text-[11px] tracking-[0.06em] text-mc-muted-2">{citations.length} SOURCES</span>
						<div className="flex flex-wrap gap-1.5">
							{citations.map((c, j) => {
								// Slack citations: show #channel and (when available) a permalink to the thread, plus author/time on hover.
								if (c.source === 'slack' && c.slack) {
									const label = c.slack.channel ? `#${c.slack.channel}` : 'Slack thread';
									const title = [c.slack.author && `by ${c.slack.author}`, c.slack.timestamp && new Date(c.slack.timestamp).toLocaleString(), `score ${c.score.toFixed(3)}`]
										.filter(Boolean)
										.join(' · ');
									const chipClass =
										'flex items-center gap-1.5 rounded-full border border-mc-border bg-mc-raised px-2.5 py-1 font-mono text-[11.5px] text-mc-text-3 shadow-e1';
									return c.slack.permalink ? (
										<a key={j} href={c.slack.permalink} target="_blank" rel="noreferrer" title={title} className={cn(chipClass, 'transition-colors hover:text-mc-accent')}>
											<MessagesSquare className="h-3 w-3 text-mc-accent-lo" />
											{label}
										</a>
									) : (
										<span key={j} title={title} className={chipClass}>
											<MessagesSquare className="h-3 w-3 text-mc-accent-lo" />
											{label}
										</span>
									);
								}
								const code = isCodeSource(c.sourcePath);
								return (
									<span
										key={j}
										title={`score ${c.score.toFixed(3)}`}
										className="flex items-center gap-1.5 rounded-full border border-mc-border bg-mc-raised px-2.5 py-1 font-mono text-[11.5px] text-mc-text-3 shadow-e1"
									>
										{code ? <FileCode2 className="h-3 w-3 text-mc-accent" /> : <FileText className="h-3 w-3 text-mc-purple" />}
										{c.sourcePath.split('/').pop()}
									</span>
								);
							})}
						</div>
					</div>
				)}

				{(turn.latencyMs != null || turn.modelUsed || turn.tokensTotal != null) && (
					<div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-mc-muted">
						{turn.latencyMs != null && <span>{turn.latencyMs}ms</span>}
						{turn.modelUsed && <><span>·</span><span>{turn.modelUsed}</span></>}
						{turn.tokensTotal != null && <><span>·</span><span>{turn.tokensTotal} tokens</span></>}
					</div>
				)}
			</div>
		</div>
	);
}

/** Renders answer text, promoting ```fenced``` spans to monospace code blocks. */
export function AnswerBody({ text }: { text: string }) {
	const parts = text.split(/```/);
	return (
		<div className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-mc-text-2">
			{parts.map((part, i) =>
				i % 2 === 1 ? (
					<pre key={i} className="overflow-x-auto rounded-xl border border-mc-border bg-mc-surface p-3.5 font-mono text-[12.5px] leading-relaxed text-mc-text-2 shadow-e1">
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

export function StreamingIndicator() {
	return (
		<div className="flex items-center gap-3">
			<MeshAvatar size={28} breathe />
			<span className="text-[12.5px] text-mc-text-3">Mesh is retrieving context…</span>
			<div className="flex gap-1">
				{[0, 1, 2].map((n) => (
					<span key={n} className="h-1.5 w-1.5 animate-meshpulse rounded-full bg-mc-accent" style={{ animationDelay: `${n * 0.2}s` }} />
				))}
			</div>
		</div>
	);
}
