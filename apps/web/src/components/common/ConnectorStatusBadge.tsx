import { StatusDot } from '@/components/mc/primitives';
import { connectorStatus } from '@/lib/connector-status';

/** A connector status pill (dot + label), shared across GitHub, Documents, and Slack sources. */
export function ConnectorStatusBadge({ status }: { status: string }) {
	const st = connectorStatus(status);
	return (
		<span className="flex items-center gap-1.5 rounded-full border border-black/[.06] bg-mc-surface px-2 py-0.5 font-mono text-[10px] text-mc-text-3">
			<StatusDot color={st.dot} glow={st.dot === 'success' || st.dot === 'indexing'} pulse={st.dot === 'indexing'} />
			{st.label}
		</span>
	);
}
