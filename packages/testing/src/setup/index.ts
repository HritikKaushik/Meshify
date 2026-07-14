// Global Vitest setup for every Meshify suite. Referenced from vitest configs as
// a `setupFiles` entry (e.g. `setupFiles: ['@meshify/testing/setup']`). Keep this
// side-effect-only: register shared matchers, install global test hooks, etc.
import '../custom-matchers/index.js';
