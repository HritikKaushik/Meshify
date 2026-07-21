#!/usr/bin/env node
/**
 * Preflight: sync ROCKETRIDE_URI in .env to the live RocketRide engine port.
 *
 * The RocketRide VS Code extension starts its local engine with `--port=0`, so
 * the OS assigns a fresh ephemeral port on every launch. That drifts out of sync
 * with the hard-coded ROCKETRIDE_URI in .env, and the worker then fails to reach
 * the runtime ("Failed to connect to ws://localhost:<stale>/task/service").
 *
 * This script finds the running engine's actual listening port and rewrites the
 * ROCKETRIDE_URI line in .env before the dev processes boot. It is intentionally
 * best-effort: if the engine isn't running (e.g. frontend-only work), it warns
 * and leaves .env untouched so `pnpm dev` still starts.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get } from 'node:http';

const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));
const ENGINE_MATCH = 'RocketRide/engine/engine';

/** Silently run a shell command, returning stdout ('' on any failure). */
function sh(cmd) {
	try {
		return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
	} catch {
		return '';
	}
}

/** Candidate localhost ports the running engine process is LISTENing on, low→high. */
function engineListenPorts() {
	const pids = sh(`pgrep -f '${ENGINE_MATCH}'`).trim().split('\n').filter(Boolean);
	if (pids.length === 0) return [];
	const ports = new Set();
	for (const pid of pids) {
		// -a ANDs the selectors; without it lsof ORs -p/-i and returns every socket.
		const out = sh(`lsof -a -nP -p ${pid} -iTCP -sTCP:LISTEN`);
		for (const line of out.split('\n')) {
			// e.g. "...TCP 127.0.0.1:54917 (LISTEN)" or "...TCP [::1]:54918 (LISTEN)"
			const m = line.match(/:(\d+)\s+\(LISTEN\)/);
			if (m) ports.add(Number(m[1]));
		}
	}
	return [...ports].sort((a, b) => a - b);
}

/**
 * Is this URI a local engine (something we may retarget to a fresh port), or a
 * deliberately-pinned remote/cloud engine (which we must never touch)? An
 * unparseable value is treated as local so a broken URI still gets repaired.
 */
function isLocalUri(uri) {
	try {
		const host = new URL(uri).hostname;
		return host === 'localhost' || host === '127.0.0.1' || host === '::1';
	} catch {
		return true;
	}
}

/** Resolves the HTTP status of a GET to localhost:port, or 0 if it doesn't respond. */
function probe(port) {
	return new Promise((resolve) => {
		const req = get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
			res.resume();
			resolve(res.statusCode ?? 0);
		});
		req.on('error', () => resolve(0));
		req.on('timeout', () => {
			req.destroy();
			resolve(0);
		});
	});
}

async function main() {
	// Read .env up front so we can honour a pinned remote URI before doing any
	// local-port discovery.
	let env;
	try {
		env = readFileSync(ENV_PATH, 'utf8');
	} catch {
		console.warn(`[rocketride] no .env at ${ENV_PATH} — skipping port sync.`);
		return;
	}

	const uriLine = /^ROCKETRIDE_URI=.*$/m;
	const currentLine = env.match(uriLine)?.[0];
	if (!currentLine) {
		console.warn('[rocketride] no active ROCKETRIDE_URI line in .env — skipping port sync.');
		return;
	}
	const currentUri = currentLine.slice('ROCKETRIDE_URI='.length);

	// Respect a deliberately-pinned remote/cloud engine: if ROCKETRIDE_URI points
	// anywhere other than localhost, the developer is testing against a hosted
	// RocketRide (e.g. the cloud endpoint), so never clobber it with a local port.
	if (!isLocalUri(currentUri)) {
		console.log(`[rocketride] ROCKETRIDE_URI is remote (${currentUri}) — leaving it untouched (pinned to a hosted engine).`);
		return;
	}

	const ports = engineListenPorts();
	if (ports.length === 0) {
		console.warn('[rocketride] engine not running — leaving ROCKETRIDE_URI as-is. Ingest/chat will fail until the RocketRide VS Code extension starts it.');
		return;
	}

	// The main engine's service port answers GET / with 200; RocketRide's per-task
	// data/debug ports (spawned when a pipeline runs) answer 401/403. Since ports are
	// sorted low→high, a running task's low-numbered data_port (e.g. 20001) would
	// otherwise shadow the real engine port and the client would 403 on
	// ws://.../task/service. So prefer a 200, and only fall back to any responding
	// port if none returns 200.
	const statuses = await Promise.all(ports.map((port) => probe(port)));
	let livePort = ports.find((_, i) => statuses[i] === 200);
	if (!livePort) livePort = ports.find((_, i) => statuses[i] > 0);
	if (!livePort) {
		console.warn(`[rocketride] engine process found but no port responded to HTTP (checked ${ports.join(', ')}) — leaving ROCKETRIDE_URI as-is.`);
		return;
	}

	const desiredUri = `http://localhost:${livePort}`;
	if (currentLine === `ROCKETRIDE_URI=${desiredUri}`) {
		console.log(`[rocketride] ROCKETRIDE_URI already points at the live engine (${desiredUri}).`);
		return;
	}

	writeFileSync(ENV_PATH, env.replace(uriLine, `ROCKETRIDE_URI=${desiredUri}`), 'utf8');
	console.log(`[rocketride] synced ROCKETRIDE_URI → ${desiredUri} (was: ${currentUri}).`);
}

main().catch((err) => {
	// Never block dev startup on a preflight failure.
	console.warn(`[rocketride] port sync skipped: ${err.message}`);
});
