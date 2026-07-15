import type { DotColor } from '@/components/mc/primitives';

/** Canonical mapping from a connector's status to its dot colour + label (generalizes repo-status for all sources). */
export const CONNECTOR_STATUS: Record<string, { dot: DotColor; label: string }> = {
	active: { dot: 'success', label: 'Active' },
	connecting: { dot: 'indexing', label: 'Connecting' },
	error: { dot: 'danger', label: 'Error' },
	disconnected: { dot: 'muted', label: 'Disconnected' },
};

export function connectorStatus(status: string): { dot: DotColor; label: string } {
	return CONNECTOR_STATUS[status] ?? { dot: 'muted', label: status };
}
