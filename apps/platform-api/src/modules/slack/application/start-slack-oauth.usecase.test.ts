import { describe, expect, it } from 'vitest';
import { StartSlackOAuthUseCase } from './start-slack-oauth.usecase.js';
import { SlackNotConfiguredError } from './slack-support.js';

const CONFIG = { clientId: 'cid-123', clientSecret: 'sec', redirectUri: 'https://app.example.com/oauth/slack/callback', secret: 'signing-key-32-chars-minimum-here!!' };

describe('StartSlackOAuthUseCase', () => {
	it('mints a Slack authorize URL carrying client_id, scopes, redirect_uri and a signed state', () => {
		const result = new StartSlackOAuthUseCase(CONFIG, () => 1_000).execute({ projectId: 'proj-1' });
		const url = new URL(result.authorizeUrl);
		expect(url.origin + url.pathname).toBe('https://slack.com/oauth/v2/authorize');
		expect(url.searchParams.get('client_id')).toBe('cid-123');
		expect(url.searchParams.get('redirect_uri')).toBe(CONFIG.redirectUri);
		expect(url.searchParams.get('scope')).toContain('channels:history');
		expect(url.searchParams.get('state')).toMatch(/.+\..+/); // <payload>.<hmac>
	});

	it('throws SlackNotConfiguredError when credentials are absent', () => {
		const usecase = new StartSlackOAuthUseCase({ clientId: undefined, clientSecret: undefined, redirectUri: undefined, secret: undefined });
		expect(() => usecase.execute({ projectId: 'proj-1' })).toThrow(SlackNotConfiguredError);
	});
});
