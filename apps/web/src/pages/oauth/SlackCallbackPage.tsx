import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '@/api-client';

const OAUTH_PROJECT_KEY = 'meshify.slackOAuthProjectId';

/**
 * Slack OAuth redirect target — a static, same-origin, Clerk-gated route (the
 * redirect URI can't carry the projectId, so it travels in the signed `state`
 * and, for building the completion URL, in sessionStorage set before redirect).
 * Exchanges the code server-side, then returns to the project's Slack page.
 */
export function SlackCallbackPage() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const ran = useRef(false);

	useEffect(() => {
		if (ran.current) return; // guard React 18 StrictMode double-invoke — the code is single-use
		ran.current = true;

		const oauthError = params.get('error');
		const code = params.get('code');
		const state = params.get('state');
		const projectId = sessionStorage.getItem(OAUTH_PROJECT_KEY);

		if (oauthError) {
			setError(`Slack authorization was cancelled (${oauthError}).`);
			return;
		}
		if (!code || !state || !projectId) {
			setError('Missing or expired Slack authorization — please start the connection again.');
			return;
		}

		void api
			.completeSlackOAuth(projectId, code, state)
			.then(() => {
				sessionStorage.removeItem(OAUTH_PROJECT_KEY);
				navigate(`/projects/${projectId}/slack`, { replace: true });
			})
			.catch((err) => setError((err as Error).message));
	}, [params, navigate]);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-mc-bg px-6 text-center">
			{error ? (
				<>
					<p className="text-sm text-mc-danger">{error}</p>
					<button onClick={() => navigate('/home', { replace: true })} className="rounded-full bg-mc-accent px-4 py-2 text-[12.5px] font-semibold text-white">
						Back to projects
					</button>
				</>
			) : (
				<p className="text-sm text-mc-text-3">Finishing Slack connection…</p>
			)}
		</div>
	);
}
