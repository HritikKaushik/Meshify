import type { AuthContext, OrganizationRepository, OrgRoleKey, UserRepository } from '@meshify/data-access';

/** Who the caller is, as the web app needs to know it. */
export interface MeView {
	/** `user`: a signed-in person the BFF vouched for. `service`: an API key acting on its own. */
	principalKind: 'user' | 'service';
	org: { id: string; name: string };
	user: { id: string; email: string | null; displayName: string | null; avatarUrl: string | null } | null;
	orgRole: OrgRoleKey | null;
	isOrgAdmin: boolean;
}

export class GetMeUseCase {
	constructor(
		private readonly organizations: OrganizationRepository,
		private readonly users: UserRepository
	) {}

	async execute(auth: AuthContext): Promise<MeView> {
		const [org, user] = await Promise.all([this.organizations.findById(auth.orgId), auth.userId ? this.users.findById(auth.userId) : undefined]);
		// The key authenticated against this org a moment ago, so it exists; this
		// guards the window where the org is deleted mid-request.
		if (!org) throw new Error(`Organization ${auth.orgId} vanished during the request`);

		return {
			principalKind: user ? 'user' : 'service',
			org: { id: org.id, name: org.name },
			user: user ? { id: user.id, email: user.email, displayName: user.displayName, avatarUrl: user.avatarUrl } : null,
			orgRole: user ? (auth.orgRole ?? null) : null,
			isOrgAdmin: auth.isOrgAdmin,
		};
	}
}
