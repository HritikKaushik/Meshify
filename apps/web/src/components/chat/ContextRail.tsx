import { Link } from 'react-router-dom';
import { FileCode2, FileText, MessageSquare } from 'lucide-react';
import type { ChatCitation, Conversation } from '@/api';
import { isCodeSource, confidenceLabel } from './chat-util';
import { cn } from '@/lib/utils';

/**
 * Chat context rail (design 3d): the answer's confidence, the sources it used
 * (scored), and related conversations in this project. Everything is real —
 * confidence/sources from the live answer, related from the conversation list.
 * When the current turn came from replayed history (no confidence), the
 * confidence block is shown as "not recorded" rather than fabricated.
 */
export function ContextRail({
	confidence,
	sources,
	related,
	projectId,
}: {
	confidence?: number;
	sources: ChatCitation[];
	related: Conversation[];
	projectId: string;
}) {
	return (
		<aside className="hidden flex-col gap-5 lg:flex">
			{/* Confidence */}
			<Section title="CONFIDENCE">
				{confidence === undefined ? (
					<p className="text-[11px] text-mc-text-3">Not recorded for this message.</p>
				) : (
					<>
						<div className="flex items-center gap-2.5">
							<div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[.06]">
								<div className="h-full rounded-full" style={{ width: `${Math.round(confidence * 100)}%`, background: 'linear-gradient(90deg,#55C784,#3A8C63)' }} />
							</div>
							<span className="font-semibold text-[13px] text-mc-success">{Math.round(confidence * 100)}%</span>
						</div>
						<p className="mt-2 text-[11px] leading-relaxed text-mc-muted">{confidenceLabel(confidence)} · {sources.length} source{sources.length === 1 ? '' : 's'} matched.</p>
					</>
				)}
			</Section>

			{/* Sources used */}
			<Section title="SOURCES USED">
				{sources.length === 0 ? (
					<p className="text-[11px] text-mc-text-3">Citations from Mesh's answers will appear here.</p>
				) : (
					<div className="flex flex-col gap-2">
						{sources.map((c, i) => {
							const code = isCodeSource(c.sourcePath);
							return (
								<div
									key={c.sourcePath}
									className={cn('flex items-center gap-2.5 rounded-[10px] border p-2.5', i === 0 ? 'border-mc-accent/25 bg-mc-accent/[.06]' : 'border-white/[.06] bg-[rgba(18,18,24,.5)]')}
								>
									{code ? <FileCode2 className="h-3.5 w-3.5 flex-none text-mc-teal" /> : <FileText className="h-3.5 w-3.5 flex-none text-mc-indexing" />}
									<div className="flex min-w-0 flex-1 flex-col">
										<span className="truncate font-mono text-[11.5px] text-mc-text">{c.sourcePath.split('/').pop()}</span>
										<span className="truncate font-mono text-[10px] text-mc-muted">{c.sourcePath}</span>
									</div>
									<span className="flex-none font-mono text-[10.5px] text-mc-success">{c.score.toFixed(2)}</span>
								</div>
							);
						})}
					</div>
				)}
			</Section>

			{/* Related conversations */}
			{related.length > 0 && (
				<Section title="RELATED CONVERSATIONS">
					<div className="flex flex-col gap-2">
						{related.slice(0, 5).map((c) => (
							<Link
								key={c.id}
								to={`/projects/${projectId}/chat?c=${c.id}`}
								className="flex items-center gap-2 rounded-lg border border-white/[.06] px-2.5 py-2 text-[12px] text-mc-text-2 transition-colors hover:border-white/15 hover:text-mc-text"
							>
								<MessageSquare className="h-3 w-3 flex-none text-mc-muted-2" />
								<span className="truncate">{c.title ?? 'Untitled conversation'}</span>
							</Link>
						))}
					</div>
				</Section>
			)}
		</aside>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-2.5">
			<span className="font-mono text-[10px] tracking-[.1em] text-mc-muted-2">{title}</span>
			{children}
		</div>
	);
}
