import { useCallback, useState, type ReactNode } from 'react';
import { ApiError } from './api';

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
	return (
		<section className="section">
			<header>
				<h2>{title}</h2>
				{subtitle && <p className="subtitle">{subtitle}</p>}
			</header>
			{children}
		</section>
	);
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="field">
			<span>{label}</span>
			{children}
		</label>
	);
}

/** Pretty-prints any value; used to show raw API responses. */
export function Json({ value }: { value: unknown }) {
	return <pre className="json">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>;
}

export function Result({ state }: { state: AsyncState<unknown> }) {
	if (state.status === 'idle') return null;
	if (state.status === 'pending') return <p className="pending">Working…</p>;
	if (state.status === 'error')
		return (
			<div className="error">
				<strong>{state.error instanceof ApiError ? `HTTP ${state.error.status}` : 'Error'}</strong>: {state.error.message}
				{state.error instanceof ApiError && state.error.body ? <Json value={state.error.body} /> : null}
			</div>
		);
	return <Json value={state.value} />;
}

export type AsyncState<T> =
	| { status: 'idle' }
	| { status: 'pending' }
	| { status: 'success'; value: T }
	| { status: 'error'; error: Error };

/** Runs an async action, tracking idle/pending/success/error for the UI. */
export function useAsync<T>() {
	const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
	const run = useCallback(async (fn: () => Promise<T>) => {
		setState({ status: 'pending' });
		try {
			const value = await fn();
			setState({ status: 'success', value });
			return value;
		} catch (err) {
			setState({ status: 'error', error: err instanceof Error ? err : new Error(String(err)) });
			return undefined;
		}
	}, []);
	return { state, run };
}
