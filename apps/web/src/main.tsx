import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { App } from './App';
import { Toaster } from '@/components/ui/sonner';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY — set it in .env (see .env.example).');

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');
createRoot(root).render(
	<StrictMode>
		<ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
			<BrowserRouter>
				<App />
				<Toaster />
			</BrowserRouter>
		</ClerkProvider>
	</StrictMode>
);
