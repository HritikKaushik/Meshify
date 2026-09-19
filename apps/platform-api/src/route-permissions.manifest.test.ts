import type { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { routeManifest } from './http/router.js';
import { createChatController } from './modules/chat/interface/chat.controller.js';
import { createConnectorsController } from './modules/connectors/interface/connectors.controller.js';
import { createDocumentsController } from './modules/documents/interface/documents.controller.js';
import { createHealthController } from './modules/health/interface/health.controller.js';
import { createIdentityController } from './modules/identity/interface/identity.controller.js';
import { createIntegrationsController } from './modules/integrations/interface/integrations.controller.js';
import { createWebhooksController } from './modules/integrations/interface/webhooks.controller.js';
import { createJobsController } from './modules/jobs/interface/jobs.controller.js';
import { createLlmProvidersController } from './modules/llm-providers/interface/llm-providers.controller.js';
import { createProjectsController } from './modules/projects/interface/projects.controller.js';
import { createRepositoriesController } from './modules/repositories/interface/repositories.controller.js';
import { buildTestAuthorizer } from './modules/security/authorization/authorizer.testutil.js';
import { createSlackController } from './modules/slack/interface/slack.controller.js';

/**
 * The API's access policy, as one reviewable list. Controllers only touch their
 * use cases inside handlers, so they can be constructed here with nothing but
 * the authorizer; what each route DECLARES is read back off the router.
 *
 * A new route appears here as a new line, a changed permission as a changed
 * line, and a route with no policy never gets this far: `createRouter` throws
 * when the controller registers it. Every controller main.ts mounts must be
 * listed below (the last test checks main.ts against this file).
 */
const { authz } = buildTestAuthorizer({ getProject: { execute: async () => undefined } as never });
const useCases = { authz } as never;

const CONTROLLERS: Record<string, () => Router> = {
	createHealthController: () => createHealthController({} as never),
	createWebhooksController: () => createWebhooksController({} as never),
	createIdentityController: () => createIdentityController({} as never),
	createProjectsController: () => createProjectsController(useCases),
	createDocumentsController: () => createDocumentsController(useCases),
	createJobsController: () => createJobsController(useCases),
	createRepositoriesController: () => createRepositoriesController(useCases),
	createConnectorsController: () => createConnectorsController(useCases),
	createIntegrationsController: () => createIntegrationsController(useCases),
	createLlmProvidersController: () => createLlmProvidersController(useCases),
	createSlackController: () => createSlackController(useCases),
	createChatController: () => createChatController(useCases),
};

function describePolicy(policy: ReturnType<typeof routeManifest>[number]['policy']): string {
	if (policy.kind === 'permission') return policy.permission;
	return `${policy.kind.toUpperCase()} (${policy.reason})`;
}

describe('route permissions manifest', () => {
	it('every endpoint declares exactly this access policy', () => {
		const lines = Object.values(CONTROLLERS)
			.flatMap((build) => routeManifest(build()))
			.map((entry) => `${entry.method.padEnd(6)} ${entry.path}  ->  ${describePolicy(entry.policy)}`);

		expect(lines).toMatchInlineSnapshot(`
			[
			  "GET    /health/live  ->  PUBLIC (liveness probe; reveals nothing)",
			  "GET    /health/ready  ->  PUBLIC (readiness probe; names dependencies and their state, never error detail)",
			  "POST   /v1/integrations/webhooks/:provider | /v1/integrations/webhooks/:provider/:registrationId  ->  PUBLIC (provider deliveries are authenticated by their signature over the raw body, not by a Meshify credential)",
			  "GET    /v1/me  ->  AUTHENTICATED (describes only the caller)",
			  "GET    /v1/projects  ->  AUTHENTICATED (lists only the projects the caller can see)",
			  "POST   /v1/projects  ->  projects:create",
			  "GET    /v1/projects/:projectId  ->  project:read",
			  "GET    /v1/projects/:projectId/stats  ->  project:read",
			  "DELETE /v1/projects/:projectId  ->  project:delete",
			  "GET    /v1/projects/:projectId/documents  ->  documents:read",
			  "POST   /v1/projects/:projectId/documents  ->  documents:write",
			  "DELETE /v1/projects/:projectId/documents/:documentId  ->  documents:delete",
			  "GET    /v1/projects/:projectId/documents/:documentId/content  ->  documents:read",
			  "GET    /v1/jobs/:jobId  ->  AUTHENTICATED (the job names its project; jobs:read is checked on it once it is loaded)",
			  "GET    /v1/projects/:projectId/jobs  ->  jobs:read",
			  "GET    /v1/projects/:projectId/jobs/stream  ->  jobs:read",
			  "POST   /v1/projects/:projectId/repositories  ->  repositories:write",
			  "GET    /v1/projects/:projectId/repositories  ->  repositories:read",
			  "DELETE /v1/projects/:projectId/repositories/:repositoryId  ->  repositories:delete",
			  "POST   /v1/projects/:projectId/repositories/:repositoryId/sync  ->  repositories:sync",
			  "GET    /v1/projects/:projectId/connectors  ->  connectors:read",
			  "DELETE /v1/projects/:projectId/connectors/:connectorId  ->  connectors:manage",
			  "GET    /v1/providers  ->  integrations:read",
			  "GET    /v1/integrations  ->  integrations:read",
			  "POST   /v1/integrations/:provider/connect  ->  integrations:manage",
			  "POST   /v1/integrations/:provider/callback  ->  integrations:manage",
			  "POST   /v1/integrations/:integrationId/reconnect  ->  integrations:manage",
			  "DELETE /v1/integrations/:integrationId  ->  integrations:manage",
			  "GET    /v1/integrations/:integrationId/resources  ->  integrations:read",
			  "GET    /v1/providers/:provider/registration  ->  provider_registrations:read",
			  "PUT    /v1/providers/:provider/registration  ->  provider_registrations:manage",
			  "DELETE /v1/providers/:provider/registration  ->  provider_registrations:manage",
			  "GET    /v1/integrations/stream  ->  integrations:read",
			  "GET    /v1/providers/llm  ->  llm_providers:read",
			  "GET    /v1/providers/llm/:provider  ->  llm_providers:read",
			  "GET    /v1/providers/llm/:provider/models  ->  llm_providers:read",
			  "POST   /v1/providers/llm/:provider/connect  ->  llm_providers:manage",
			  "POST   /v1/providers/llm/:provider/test  ->  llm_providers:manage",
			  "POST   /v1/providers/llm/:provider/activate  ->  llm_providers:manage",
			  "DELETE /v1/providers/llm/:provider  ->  llm_providers:manage",
			  "POST   /v1/projects/:projectId/connectors/slack  ->  connectors:manage",
			  "POST   /v1/projects/:projectId/connectors/slack/oauth/start  ->  connectors:manage",
			  "POST   /v1/projects/:projectId/connectors/slack/oauth/complete  ->  connectors:manage",
			  "GET    /v1/projects/:projectId/connectors/slack/:connectorId/channels  ->  connectors:read",
			  "POST   /v1/projects/:projectId/connectors/slack/:connectorId/channels  ->  connectors:manage",
			  "POST   /v1/projects/:projectId/connectors/slack/:connectorId/sync  ->  connectors:sync",
			  "POST   /v1/projects/:projectId/chat  ->  chat:write",
			  "GET    /v1/projects/:projectId/chats  ->  chat:read",
			  "PATCH  /v1/projects/:projectId/chats/:chatId  ->  chat:write",
			  "DELETE /v1/projects/:projectId/chats/:chatId  ->  chat:write",
			  "GET    /v1/projects/:projectId/chats/:chatId/messages  ->  chat:read",
			]
		`);
	});

	it('only health probes and signature-verified provider webhooks are public', () => {
		const publicPaths = Object.values(CONTROLLERS)
			.flatMap((build) => routeManifest(build()))
			.filter((entry) => entry.policy.kind === 'public')
			.map((entry) => entry.path);

		expect(publicPaths).toEqual(['/health/live', '/health/ready', '/v1/integrations/webhooks/:provider | /v1/integrations/webhooks/:provider/:registrationId']);
	});

	it('covers every controller the composition root mounts', async () => {
		const { readFile } = await import('node:fs/promises');
		const main = await readFile(new URL('./main.ts', import.meta.url), 'utf8');
		const mounted = [...main.matchAll(/\b(create\w+Controller)\(/g)].map((m) => m[1]!);
		expect([...new Set(mounted)].sort()).toEqual(Object.keys(CONTROLLERS).sort());
	});
});
