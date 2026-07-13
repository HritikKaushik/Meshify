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

/** Resolves true if an HTTP GET to localhost:port returns any response (server is alive). */
function probe(port) {
	return new Promise((resolve) => {
		const req = get({ host: '127.0.0.1', port, path: '/', timeout: 2000 }, (res) => {
			res.resume();
			resolve(res.statusCode !== undefined);
		});
		req.on('error', () => resolve(false));
		req.on('timeout', () => {
			req.destroy();
			resolve(false);
		});
	});
}

async function main() {
	const ports = engineListenPorts();
	if (ports.length === 0) {
		console.warn('[rocketride] engine not running — leaving ROCKETRIDE_URI as-is. Ingest/chat will fail until the RocketRide VS Code extension starts it.');
		return;
	}

	let livePort;
	for (const port of ports) {
		if (await probe(port)) {
			livePort = port;
			break;
		}
	}
	if (!livePort) {
		console.warn(`[rocketride] engine process found but no port responded to HTTP (checked ${ports.join(', ')}) — leaving ROCKETRIDE_URI as-is.`);
		return;
	}

	const desiredUri = `http://localhost:${livePort}`;
	let env;
	try {
		env = readFileSync(ENV_PATH, 'utf8');
	} catch {
		console.warn(`[rocketride] no .env at ${ENV_PATH} — skipping port sync.`);
		return;
	}

	// Match the active (uncommented) ROCKETRIDE_URI line only.
	const uriLine = /^ROCKETRIDE_URI=.*$/m;
	if (!uriLine.test(env)) {
		console.warn('[rocketride] no active ROCKETRIDE_URI line in .env — skipping port sync.');
		return;
	}

	const current = env.match(uriLine)[0];
	if (current === `ROCKETRIDE_URI=${desiredUri}`) {
		console.log(`[rocketride] ROCKETRIDE_URI already points at the live engine (${desiredUri}).`);
		return;
	}

	writeFileSync(ENV_PATH, env.replace(uriLine, `ROCKETRIDE_URI=${desiredUri}`), 'utf8');
	console.log(`[rocketride] synced ROCKETRIDE_URI → ${desiredUri} (was: ${current.split('=')[1]}).`);
}

main().catch((err) => {
	// Never block dev startup on a preflight failure.
	console.warn(`[rocketride] port sync skipped: ${err.message}`);
});
