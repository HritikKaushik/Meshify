import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The BFF (apps/bff) is Clerk-session-authenticated and has no CORS middleware,
// so in dev we proxy same-origin /api to it (mirrors the old direct-to-platform-api
// proxy this replaced). The browser thus talks only to the Vite origin — no CORS,
// no backend change. Point BFF_ORIGIN elsewhere to test against a remote/deployed BFF.
const bffOrigin = process.env.BFF_ORIGIN ?? 'http://localhost:3001';

export default defineConfig({
	// Vite defaults envDir to the app root; point it at the monorepo root so the
	// browser bundle reads VITE_CLERK_PUBLISHABLE_KEY from the same shared .env
	// that the backend apps load — one env file for the whole project.
	envDir: fileURLToPath(new URL('../../', import.meta.url)),
	plugins: [react()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	server: {
		port: 5174,
		proxy: {
			'/api': { target: bffOrigin, changeOrigin: true },
		},
	},
});
