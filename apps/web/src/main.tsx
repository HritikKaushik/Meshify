import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — set it in .env (see .env.example).');

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
	<StrictMode>
		{/* Last line of defense: a provider-level failure still renders a message instead of a blank page. */}
		<ErrorBoundary>
			<ThemeProvider>
				<ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
					<BrowserRouter>
						<TooltipProvider>
							<App />
							<Toaster />
						</TooltipProvider>
					</BrowserRouter>
				</ClerkProvider>
			</ThemeProvider>
		</ErrorBoundary>
	</StrictMode>
);
