import type { Router } from 'express';
import { createRouter } from '../../../http/router.js';
import type { GetMeUseCase } from '../application/get-me.usecase.js';

export interface IdentityControllerDeps {
	getMe: GetMeUseCase;
}

export function createIdentityController(deps: IdentityControllerDeps): Router {
	const router = createRouter();

	// The caller's own identity, org and role. The browser never sees a role any
	// other way: the BFF derives it server-side and it rides to platform-api in
	// headers the browser cannot read.
	router.get('/v1/me', async (req, res) => {
		res.status(200).json(await deps.getMe.execute(req.auth!));
	});

	return router;
}
