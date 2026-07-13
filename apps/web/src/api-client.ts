import { MeshifyApi } from './api';

/**
 * Single shared client — auth is entirely session-cookie based now (see
 * api.ts), so there's no per-user config to thread through a memoized
 * instance anymore; baseUrl '' means same-origin (the Vite dev proxy forwards
 * /api to the BFF).
 */
export const api = new MeshifyApi({ baseUrl: '' });
