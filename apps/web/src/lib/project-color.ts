// Stable, deterministic accent color per project id — mirrors the varied
// per-project square swatches in the Mission Control sidebar. Purely cosmetic.
const PALETTE = ['#E39A4C', '#6E9BE8', '#8B7CC9', '#5AA9A0', '#B0685E', '#D9B04C'];

export function projectColor(id: string): string {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
	return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
