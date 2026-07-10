import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The platform-api is key-authenticated and has no CORS middleware, so in dev we
// proxy same-origin paths (/v1, /health) to it. The browser thus talks only to
// the Vite origin — no CORS, no backend change. Point PLATFORM_API_ORIGIN
// elsewhere to test against a remote/deployed API.
const apiOrigin = process.env.PLATFORM_API_ORIGIN ?? 'http://localhost:3000';

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5174,
		proxy: {
			'/v1': { target: apiOrigin, changeOrigin: true },
			'/health': { target: apiOrigin, changeOrigin: true },
		},
	},
});
