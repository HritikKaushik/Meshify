// Stable, deterministic accent color per project id — the small per-project
// square swatches across the workspace. Purely cosmetic; tuned for the light
// theme (blues, indigo, teal, green, amber).
const PALETTE = ['#1A73E8', '#6366F1', '#4F8DFB', '#1E9E6A', '#0EA5A5', '#E8A33D'];

export function projectColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
	return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
