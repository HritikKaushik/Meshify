import type { DotColor } from '@/components/mc/primitives';

/** Canonical mapping from a repository's sync status to its dot colour + label. */
export const REPO_STATUS: Record<string, { dot: DotColor; label: string }> = {
	synced: { dot: 'success', label: 'Synced' },
	cloning: { dot: 'indexing', label: 'Cloning' },
	pending: { dot: 'muted', label: 'Pending' },
	failed: { dot: 'danger', label: 'Failed' },
};

/** Resolve a sync status to its display config, falling back to the raw value. */
export function repoStatus(status: string): { dot: DotColor; label: string } {
	return REPO_STATUS[status] ?? { dot: 'muted', label: status };
}
