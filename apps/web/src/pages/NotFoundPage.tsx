import { Link } from 'react-router-dom';

export function NotFoundPage() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
			<h1 className="text-4xl font-bold">404</h1>
			<p className="text-muted-foreground">This page doesn't exist.</p>
			<Link to="/" className="text-primary underline underline-offset-4">
				Back home
			</Link>
		</div>
	);
}
