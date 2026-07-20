/**
 * Token-scoped Slack auth operations (no OAuth app config needed): liveness
 * check for provider health and best-effort revocation on disconnect.
 */

const SLACK_API_BASE = 'https://slack.com/api';

export interface SlackAuthIdentity {
	teamId: string;
	teamName: string | null;
	botUserId: string | null;
}

/** auth.test — verifies the token is live and returns the identity it belongs to. Throws on invalid/revoked tokens. */
export async function testAuth(token: string, apiBaseUrl = SLACK_API_BASE): Promise<SlackAuthIdentity> {
	const res = await fetch(`${apiBaseUrl}/auth.test`, {
		method: 'POST',
		headers: { authorization: `Bearer ${token}` },
	});
	if (!res.ok) throw new Error(`Slack auth.test failed: HTTP ${res.status}`);
	const body = (await res.json()) as { ok: boolean; error?: string; team_id?: string; team?: string; user_id?: string };
	if (!body.ok || !body.team_id) throw new Error(`Slack auth.test rejected: ${body.error ?? 'unknown error'}`);
	return { teamId: body.team_id, teamName: body.team ?? null, botUserId: body.user_id ?? null };
}

/** auth.revoke — invalidates the token at Slack. Returns false (never throws) on failure: revocation is best-effort. */
export async function revokeToken(token: string, apiBaseUrl = SLACK_API_BASE): Promise<boolean> {
	try {
		const res = await fetch(`${apiBaseUrl}/auth.revoke`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}` },
		});
		if (!res.ok) return false;
		const body = (await res.json()) as { ok: boolean; revoked?: boolean };
		return body.ok && body.revoked === true;
	} catch {
		return false;
	}
}
