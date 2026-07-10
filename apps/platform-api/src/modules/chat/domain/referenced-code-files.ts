const CODE_EXTENSIONS = new Set([
	'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs',
	'py', 'go', 'rs', 'java', 'kt', 'scala', 'groovy',
	'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'cs', 'fs', 'rb', 'php', 'swift',
	'sql', 'sh', 'bash', 'zsh', 'ps1', 'vue', 'svelte', 'tf', 'proto', 'graphql', 'prisma',
]);

/** Source paths among the citations that are code files (vs prose documents), deduplicated, order preserved. */
export function extractReferencedCodeFiles(citations: Array<{ sourcePath: string }>): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const citation of citations) {
		const base = citation.sourcePath.split('/').pop() ?? citation.sourcePath;
		const ext = base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
		const isCode = CODE_EXTENSIONS.has(ext) || /^(dockerfile|makefile)$/i.test(base);
		if (isCode && !seen.has(citation.sourcePath)) {
			seen.add(citation.sourcePath);
			result.push(citation.sourcePath);
		}
	}
	return result;
}
