import { hashApiKey, looksLikeApiKey, type ActiveApiKey, type ApiKeyRepository, type AuthContext, type OrgMembershipRepository, type OrgRoleKey } from '@meshify/data-access';
import { verifyActorAssertion, type ActorAssertionFailure } from '@meshify/shared';

/** Thrown when a presented credential is missing, malformed, unknown, revoked, or expired. */
export class AuthenticationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthenticationError';
	}
}

/**
 * Thrown when the BFF vouches for a person who holds no active membership of
 * the key's organization. The credential is fine; the person is not a member.
 */
export class NotAMemberError extends Error {
	constructor() {
		super('Not an active member of this organization');
		this.name = 'NotAMemberError';
	}
}

/** The credential material of one request, as read off its headers. */
export interface AuthenticateInput {
	/** The raw `Authorization` header (Bearer msk_...). */
	authorization: string | undefined;
	/** The BFF's signed identity assertion (`X-Meshify-Actor`). */
	assertion?: string | undefined;
	/**
	 * Legacy `X-Meshify-Org-Role` (`admin`/`member`), honoured only while no
	 * valid assertion accompanies the request. ABSENT means a direct API-key
	 * caller, treated as full-access within the key's scopes.
	 */
	orgRole?: string | undefined;
	/** `X-Meshify-User-Id` (the Clerk user id); keys per-user rate limits only. */
	actorId?: string | undefined;
}

export interface IdentityAssertionOptions {
	/** `BFF_ASSERTION_SECRET`. Unset: assertions are ignored and the legacy headers apply. */
	secret: string | undefined;
	/**
	 * `permissive` (rollout): a missing or unverifiable assertion falls back to
	 * the legacy headers. `required`: a request on a BFF key must carry a valid one.
	 */
	mode: 'permissive' | 'required';
	memberships: Pick<OrgMembershipRepository, 'findByOrgAndUser'>;
	/** Observability hook for an assertion that was presented but not accepted. */
	onRejected?: (reason: ActorAssertionFailure | 'org_mismatch', keyId: string) => void;
}

/**
 * Resolves a request's credentials into an org-scoped AuthContext.
 *
 * Deliberately returns the SAME error for missing / malformed / unknown /
 * revoked / expired keys - distinguishing them would let a caller probe which
 * keys exist. `last_used_at` is updated best-effort and never blocks the
 * request (a failed touch must not deny a valid key).
 *
 * Identity: a `bff` key acts on behalf of a signed-in person, named by the
 * BFF's signed assertion. The assertion carries identity only; the person's
 * role is read from `org_memberships` here, on every request, so a role change
 * or a removal takes effect immediately. A `service` key never reads the
 * assertion header, so a machine credential cannot impersonate a person.
 */
export class AuthenticateApiKeyUseCase {
	constructor(
		private readonly apiKeys: ApiKeyRepository,
		private readonly pepper: string,
		private readonly identity?: IdentityAssertionOptions
	) {}

	async execute(input: AuthenticateInput): Promise<AuthContext> {
		const presented = extractBearer(input.authorization);
		if (!presented || !looksLikeApiKey(presented)) {
			throw new AuthenticationError('Missing or malformed API key');
		}

		const keyHash = hashApiKey(this.pepper, presented);
		const key = await this.apiKeys.findByHash(keyHash);
		if (!key || key.revokedAt !== null) {
			throw new AuthenticationError('Invalid API key');
		}
		if (key.expiresAt !== null && key.expiresAt.getTime() <= Date.now()) {
			throw new AuthenticationError('Invalid API key');
		}

		// Fire-and-forget; swallow errors so telemetry never gates authentication.
		void this.apiKeys.touch(key.id).catch(() => undefined);

		const actorId = input.actorId && ACTOR_ID_PATTERN.test(input.actorId) ? input.actorId : undefined;
		const base = { orgId: key.orgId, keyId: key.id, keyKind: key.kind, scopes: key.scopes, ...(actorId ? { actorId } : {}) };

		// A key's scopes cap what it can do: EMPTY scopes = unrestricted (the shared
		// org key + every existing/Clerk-provisioned key - unchanged behaviour); a
		// non-empty scope list is least-privilege, and org-admin then requires an
		// explicit `admin` scope.
		const keyIsAdminCapable = key.scopes.length === 0 || key.scopes.includes('admin');

		const member = await this.resolveMember(key, input.assertion);
		if (member) {
			return { ...base, userId: member.userId, orgRole: member.orgRole, isOrgAdmin: keyIsAdminCapable && member.orgRole !== 'member' };
		}

		// Legacy path: the BFF-forwarded role downscopes Clerk users (a member is
		// never admin regardless of the key's scopes); no header at all is a direct
		// API-key caller.
		const roleIsAdmin = input.orgRole === undefined ? true : input.orgRole === 'admin';
		return { ...base, isOrgAdmin: keyIsAdminCapable && roleIsAdmin };
	}

	/** The person a BFF key is acting for, or undefined when the legacy headers should decide. */
	private async resolveMember(key: ActiveApiKey, assertion: string | undefined): Promise<{ userId: string; orgRole: OrgRoleKey } | undefined> {
		const identity = this.identity;
		if (!identity?.secret || key.kind !== 'bff') return undefined;

		const verified = verifyActorAssertion(identity.secret, assertion);
		// An assertion minted for another org must not ride on this org's key.
		const failure = !verified.ok ? verified.reason : verified.payload.org !== key.orgId ? 'org_mismatch' : undefined;
		if (failure || !verified.ok) {
			if (assertion && failure) identity.onRejected?.(failure, key.id);
			if (identity.mode === 'required') throw new AuthenticationError('Invalid identity assertion');
			return undefined;
		}

		const membership = await identity.memberships.findByOrgAndUser(key.orgId, verified.payload.sub);
		if (!membership || membership.status !== 'active') throw new NotAMemberError();
		return { userId: membership.userId, orgRole: membership.roleKey };
	}
}

/** Clerk user ids look like `user_2abc...`; anything outside this shape is dropped rather than used as a limiter key. */
const ACTOR_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function extractBearer(header: string | undefined): string | undefined {
	if (!header) return undefined;
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1]?.trim();
}
