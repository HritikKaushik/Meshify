import { StatusDot } from '@/components/mc/primitives';
import { repoStatus } from '@/lib/repo-status';

/** A repository sync-status pill (dot + label), driven by the shared repo-status map. */
export function RepoStatusBadge({ status }: { status: string }) {
	const st = repoStatus(status);
	return (
		<span className="flex items-center gap-1.5 rounded-full bg-white/[.04] px-2 py-0.5 font-mono text-[10px] text-mc-text-2">
			<StatusDot color={st.dot} glow={st.dot === 'success' || st.dot === 'indexing'} pulse={st.dot === 'indexing'} />
			{st.label}
		</span>
	);
}
