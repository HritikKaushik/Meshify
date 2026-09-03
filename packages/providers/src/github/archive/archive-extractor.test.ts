import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import { ArchiveBudgetExceededError, ARCHIVE_LIMITS, resolveWithinRoot, withExtractedArchive } from './archive-extractor.js';

function zipWith(files: Record<string, string>): Buffer {
	const zip = new AdmZip();
	for (const [name, content] of Object.entries(files)) zip.addFile(name, Buffer.from(content));
	return zip.toBuffer();
}

describe('withExtractedArchive (zip)', () => {
	it('extracts entries into a temp dir, hands it to the callback, then removes it', async () => {
		const archive = zipWith({ 'repo/README.md': '# hi', 'repo/src/index.ts': 'export {}' });
		let seenDir = '';
		const result = await withExtractedArchive(archive, 'zip', async (dir) => {
			seenDir = dir;
			return readFile(path.join(dir, 'repo/src/index.ts'), 'utf8');
		});
		expect(result).toBe('export {}');
		await expect(stat(seenDir)).rejects.toThrow();
	});

	it('refuses entry names that escape the extraction directory (zip-slip)', () => {
		const root = path.resolve('/tmp/meshify-repo-x');
		expect(() => resolveWithinRoot(root, '../evil.txt')).toThrow(ArchiveBudgetExceededError);
		expect(() => resolveWithinRoot(root, 'a/../../evil.txt')).toThrow(ArchiveBudgetExceededError);
		expect(() => resolveWithinRoot(root, '/etc/passwd')).toThrow(ArchiveBudgetExceededError);
		expect(resolveWithinRoot(root, 'repo/src/index.ts')).toBe(path.join(root, 'repo/src/index.ts'));
	});

	it('rejects an archive whose declared inflated size exceeds the budget without inflating it', async () => {
		const zip = new AdmZip();
		zip.addFile('big.bin', Buffer.alloc(16));
		// Lie in the header the way a zip bomb does.
		zip.getEntries()[0]!.header.size = ARCHIVE_LIMITS.maxUncompressedBytes + 1;
		await expect(withExtractedArchive(zip.toBuffer(), 'zip', async () => 'unreachable')).rejects.toThrow(/declared size/);
	});
});
