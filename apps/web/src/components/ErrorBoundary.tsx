import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
	children: ReactNode;
	/** Rendered instead of the crashed subtree. Receives the error and a reset callback. */
	fallback?: (error: Error, reset: () => void) => ReactNode;
	/** Changing this value clears a caught error (e.g. the route path, so navigating away recovers). */
	resetKey?: unknown;
	onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
	error: Error | null;
}

/**
 * Catches render/lifecycle errors below it so one crashing screen cannot take
 * the whole app down to a blank page. React still has no hook for this, so it
 * stays a class component.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		this.props.onError?.(error, info);
		if (!this.props.onError) console.error('[ErrorBoundary]', error, info.componentStack);
	}

	componentDidUpdate(prev: ErrorBoundaryProps): void {
		if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
	}

	private readonly reset = () => this.setState({ error: null });

	render(): ReactNode {
		const { error } = this.state;
		if (!error) return this.props.children;
		if (this.props.fallback) return this.props.fallback(error, this.reset);
		return <DefaultErrorFallback error={error} reset={this.reset} />;
	}
}

/** Calm full-height fallback with a way back; matches the route-loading fallback's tone. */
export function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
	return (
		<div role="alert" className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
			<p className="text-base font-medium text-mc-text">Something went wrong on this screen.</p>
			<p className="max-w-md text-sm text-mc-text-3">{error.message || 'An unexpected error occurred.'}</p>
			<div className="flex gap-2">
				<button type="button" onClick={reset} className="rounded-md border border-mc-border px-3 py-1.5 text-sm text-mc-text hover:bg-mc-surface-2">
					Try again
				</button>
				<button type="button" onClick={() => window.location.reload()} className="rounded-md border border-mc-border px-3 py-1.5 text-sm text-mc-text hover:bg-mc-surface-2">
					Reload
				</button>
			</div>
		</div>
	);
}
