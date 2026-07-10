import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import * as tar from 'tar';

/**
 * Extracts a repo archive (GitHub tarball or uploaded ZIP) into a temp
 * directory and hands it to `use`; the directory is always cleaned up.
 */
export async function withExtractedArchive<T>(archive: Buffer, format: 'tar.gz' | 'zip', use: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(path.join(tmpdir(), 'meshify-repo-'));
	try {
		if (format === 'zip') {
			// adm-zip validates entry paths against zip-slip since 0.5.x
			new AdmZip(archive).extractAllTo(dir, true);
		} else {
			const tarball = path.join(dir, '__archive__.tar.gz');
			await writeFile(tarball, archive);
			await tar.extract({ file: tarball, cwd: dir });
			await rm(tarball);
		}
		return await use(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
