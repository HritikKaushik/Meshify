import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom({ when }: { when: boolean }) {
	if (when) throw new Error('render exploded');
	return <p>fine</p>;
}

describe('ErrorBoundary', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it('renders the fallback with the error message instead of unmounting the app', () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const onError = vi.fn();
		render(
			<ErrorBoundary onError={onError}>
				<Boom when />
			</ErrorBoundary>
		);
		expect(screen.getByRole('alert').textContent).toContain('render exploded');
		expect(onError).toHaveBeenCalledOnce();
	});

	it('recovers when the reset key changes (navigation to another route)', () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { rerender } = render(
			<ErrorBoundary resetKey="/a">
				<Boom when />
			</ErrorBoundary>
		);
		expect(screen.getByRole('alert')).toBeTruthy();
		rerender(
			<ErrorBoundary resetKey="/b">
				<Boom when={false} />
			</ErrorBoundary>
		);
		expect(screen.getByText('fine')).toBeTruthy();
	});
});
