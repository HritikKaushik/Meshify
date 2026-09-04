import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '@/api-client';

/**
 * Generic provider redirect target — one static, same-origin, Clerk-gated
 * route for every provider (/oauth/:provider/callback). No browser storage:
 * the server resolves org, project, and return path entirely from the
 * single-use state carried in the redirect, and the raw provider params
 * (code / installation_id / setup_action / …) pass through verbatim.
 */
export function ProviderCallbackPage() {
	const { provider = '' } = useParams();
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const ran = useRef(false);

	useEffect(() => {
		if (ran.current) return; // guard React 18 StrictMode double-invoke — the state is single-use
		ran.current = true;

		const params: Record<string, string> = {};
		for (const [key, value] of searchParams.entries()) params[key] = value;

		const state = params.state;
		if (!state) {
			setError('This connection attempt is missing its state — please start again from Meshify.');
			return;
		}

		void api
			.completeProviderConnect(provider, state, params)
			.then((result) => {
				const fallback = result.projectId ? `/projects/${result.projectId}/integrations` : '/home';
				void navigate(result.returnPath ?? fallback, { replace: true });
			})
			.catch((err) => setError((err as Error).message));
	}, [provider, searchParams, navigate]);

	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-mc-bg px-6 text-center">
			{error ? (
				<>
					<p className="max-w-md text-sm text-mc-danger">{error}</p>
					<button onClick={() => navigate('/home', { replace: true })} className="rounded-full bg-mc-accent px-4 py-2 text-[12.5px] font-semibold text-white">
						Back to projects
					</button>
				</>
			) : (
				<p className="text-sm text-mc-text-3">Finishing the connection…</p>
			)}
		</div>
	);
}
