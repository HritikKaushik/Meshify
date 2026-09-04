import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setImmediate as yieldToEventLoop } from 'node:timers/promises';
import AdmZip from 'adm-zip';
import * as tar from 'tar';

/** Upper bounds for an uploaded/downloaded repository archive once decompressed. */
export const ARCHIVE_LIMITS = {
	/** 1 GiB of extracted bytes — far above any repository worth embedding, far below the container disk. */
	maxUncompressedBytes: 1024 * 1024 * 1024,
	/** Entry count guard against archives crafted to exhaust inodes or extraction time. */
	maxEntries: 100_000,
} as const;

export class ArchiveBudgetExceededError extends Error {
	constructor(reason: string) {
		super(`Archive rejected: ${reason}`);
		this.name = 'ArchiveBudgetExceededError';
	}
}

/**
 * Extracts a repo archive (GitHub tarball or uploaded ZIP) into a temp
 * directory and hands it to `use`; the directory is always cleaned up.
 *
 * ZIPs are inflated entry by entry, asynchronously. adm-zip's `extractAllTo`
 * is fully synchronous: one 100 MB upload pinned the event loop for tens of
 * seconds, BullMQ could not renew any worker's lock, and unrelated jobs across
 * every queue were declared stalled and re-delivered while still running here.
 * Both formats enforce a decompressed-size and entry-count budget, because the
 * only other gate is the 100 MB *compressed* upload limit and a zip bomb turns
 * that into hundreds of GB on the filesystem every concurrent job shares.
 */
export async function withExtractedArchive<T>(archive: Buffer, format: 'tar.gz' | 'zip', use: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(path.join(tmpdir(), 'meshify-repo-'));
	try {
		if (format === 'zip') {
			await extractZip(archive, dir);
		} else {
			const tarball = path.join(dir, TARBALL_NAME);
			await writeFile(tarball, archive);
			await extractTarball(tarball, dir);
		}
		return await use(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

/**
 * Streams a tarball straight to disk (`download` receives the destination
 * path), extracts it, hands the tree to `use`, and cleans everything up. The
 * archive never sits in process memory: a repository is bounded by disk and
 * the extraction budget, not by the worker's heap.
 */
export async function withDownloadedTarball<T>(download: (destination: string) => Promise<void>, use: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(path.join(tmpdir(), 'meshify-repo-'));
	try {
		const tarball = path.join(dir, TARBALL_NAME);
		await download(tarball);
		await extractTarball(tarball, dir);
		return await use(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

const TARBALL_NAME = '__archive__.tar.gz';

async function extractZip(archive: Buffer, dir: string): Promise<void> {
	const zip = new AdmZip(archive);
	const entries = zip.getEntries();
	if (entries.length > ARCHIVE_LIMITS.maxEntries) throw new ArchiveBudgetExceededError(`${entries.length} entries exceeds the ${ARCHIVE_LIMITS.maxEntries} limit`);

	// Declared sizes first (cheap, catches the honest oversize), then the actual
	// inflated bytes as they arrive (catches headers that lie).
	const declared = entries.reduce((sum, e) => sum + (e.header.size ?? 0), 0);
	if (declared > ARCHIVE_LIMITS.maxUncompressedBytes) throw new ArchiveBudgetExceededError(`declared size ${declared} bytes exceeds the ${ARCHIVE_LIMITS.maxUncompressedBytes} byte limit`);

	const root = path.resolve(dir);
	let written = 0;
	let processed = 0;
	for (const entry of entries) {
		if (entry.isDirectory) continue;
		const target = resolveWithinRoot(root, entry.entryName);

		const data = await inflate(entry);
		written += data.byteLength;
		if (written > ARCHIVE_LIMITS.maxUncompressedBytes) throw new ArchiveBudgetExceededError(`inflated size exceeds the ${ARCHIVE_LIMITS.maxUncompressedBytes} byte limit`);

		await mkdir(path.dirname(target), { recursive: true });
		await writeFile(target, data);
		// Let lock renewals, heartbeats and other jobs run between entries.
		if (++processed % 50 === 0) await yieldToEventLoop();
	}
}

/**
 * Resolves an archive entry name under `root`, refusing anything that would land
 * outside it (zip-slip: `../etc/cron.d/x`, absolute paths). adm-zip already
 * normalises names on its own; this is the independent check we control.
 */
export function resolveWithinRoot(root: string, entryName: string): string {
	const target = path.resolve(root, entryName);
	if (target === root || !target.startsWith(root + path.sep)) {
		throw new ArchiveBudgetExceededError(`entry "${entryName}" escapes the extraction directory`);
	}
	return target;
}

function inflate(entry: AdmZip.IZipEntry): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		entry.getDataAsync((data, err) => (err ? reject(new Error(err)) : resolve(data)));
	});
}

async function extractTarball(tarball: string, dir: string): Promise<void> {
	let entries = 0;
	let bytes = 0;
	await tar.extract({
		file: tarball,
		cwd: dir,
		filter: (_entryPath, entry) => {
			entries += 1;
			bytes += entry.size ?? 0;
			if (entries > ARCHIVE_LIMITS.maxEntries) throw new ArchiveBudgetExceededError(`more than ${ARCHIVE_LIMITS.maxEntries} entries`);
			if (bytes > ARCHIVE_LIMITS.maxUncompressedBytes) throw new ArchiveBudgetExceededError(`declared size exceeds the ${ARCHIVE_LIMITS.maxUncompressedBytes} byte limit`);
			return true;
		},
	});
	await rm(tarball);
}
