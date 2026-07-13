import { useCallback, useState, type ReactNode } from 'react';
import { ApiError } from './api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
	return (
		<Card className="mt-5">
			<CardHeader>
				<CardTitle className="text-lg">{title}</CardTitle>
				{subtitle && <CardDescription>{subtitle}</CardDescription>}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label className="flex flex-1 min-w-[180px] flex-col gap-1.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			{children}
		</label>
	);
}

/** Pretty-prints any value; used to show raw API responses. */
export function Json({ value }: { value: unknown }) {
	return (
		<pre className="mt-3 max-h-80 overflow-auto rounded-md border bg-muted p-3 font-mono text-xs text-foreground">
			{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
		</pre>
	);
}

export function Result({ state }: { state: AsyncState<unknown> }) {
	if (state.status === 'idle') return null;
	if (state.status === 'pending') return <p className="mt-3 text-sm text-amber-500">Working…</p>;
	if (state.status === 'error')
		return (
			<div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-foreground">
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
