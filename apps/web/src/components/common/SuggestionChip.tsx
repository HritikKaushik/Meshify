/**
 * A rounded "suggested prompt" chip. Used by Mesh Chat and the Overview Ask-Mesh
 * composer — a single source for the shared chip styling.
 */
export function SuggestionChip({ children, onClick }: { children: string; onClick: () => void }) {
	return (
		<button
			onClick={onClick}
			className="rounded-full border border-mc-border bg-mc-card px-3 py-1.5 text-xs text-mc-text-3 shadow-e1 transition-colors hover:border-mc-accent/40 hover:text-mc-accent-lo"
		>
			{children}
		</button>
	);
}
