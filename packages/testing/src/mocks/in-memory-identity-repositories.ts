import { randomUUID } from 'node:crypto';
import {
	LastOwnerError,
	type CreateOrgMembershipInput,
	type OrgMember,
	type OrgMembership,
	type OrgMembershipRepository,
	type OrgRoleKey,
	type ProjectMember,
	type ProjectMembership,
	type ProjectMembershipRepository,
	type UpsertProjectMembershipInput,
	type User,
	type UserProfile,
	type UserRepository,
} from '@meshify/data-access';

/** Behavioural fakes for the identity aggregates. They mirror the Postgres semantics the use cases rely on. */

export class InMemoryUserRepository implements UserRepository {
	readonly rows = new Map<string, User>();

	async upsertByClerkId(clerkUserId: string): Promise<{ user: User; created: boolean }> {
		const existing = [...this.rows.values()].find((u) => u.clerkUserId === clerkUserId);
		if (existing) return { user: existing, created: false };
		const now = new Date();
		const user: User = { id: randomUUID(), clerkUserId, email: null, displayName: null, avatarUrl: null, lastSeenAt: null, deactivatedAt: null, createdAt: now, updatedAt: now };
		this.rows.set(user.id, user);
		return { user, created: true };
	}

	async findById(id: string): Promise<User | undefined> {
		return this.rows.get(id);
	}

	async findByClerkId(clerkUserId: string): Promise<User | undefined> {
		return [...this.rows.values()].find((u) => u.clerkUserId === clerkUserId);
	}

	async updateProfile(id: string, profile: UserProfile): Promise<void> {
		const user = this.rows.get(id);
		if (!user) return;
		this.rows.set(id, {
			...user,
			email: profile.email !== undefined ? profile.email : user.email,
			displayName: profile.displayName !== undefined ? profile.displayName : user.displayName,
			avatarUrl: profile.avatarUrl !== undefined ? profile.avatarUrl : user.avatarUrl,
			updatedAt: new Date(),
		});
	}

	async touchLastSeen(id: string): Promise<void> {
		const user = this.rows.get(id);
		if (user) this.rows.set(id, { ...user, lastSeenAt: new Date() });
	}

	async deactivateByClerkId(clerkUserId: string): Promise<boolean> {
		const user = await this.findByClerkId(clerkUserId);
		if (!user) return false;
		this.rows.set(user.id, { ...user, deactivatedAt: user.deactivatedAt ?? new Date(), email: null, displayName: null, avatarUrl: null, updatedAt: new Date() });
		return true;
	}
}

export class InMemoryOrgMembershipRepository implements OrgMembershipRepository {
	readonly rows: OrgMembership[] = [];

	constructor(
		private readonly users?: InMemoryUserRepository,
		private readonly projectMemberships?: InMemoryProjectMembershipRepository
	) {}

	async findByOrgAndUser(orgId: string, userId: string): Promise<OrgMembership | undefined> {
		return this.rows.find((m) => m.orgId === orgId && m.userId === userId);
	}

	async listByOrg(orgId: string): Promise<OrgMember[]> {
		return this.rows
			.filter((m) => m.orgId === orgId && m.status !== 'removed')
			.map((m) => {
				const user = this.users?.rows.get(m.userId);
				return { ...m, email: user?.email ?? null, displayName: user?.displayName ?? null, avatarUrl: user?.avatarUrl ?? null, lastSeenAt: user?.lastSeenAt ?? null };
			});
	}

	async hasActiveOwner(orgId: string): Promise<boolean> {
		return this.rows.some((m) => m.orgId === orgId && m.roleKey === 'owner' && m.status === 'active');
	}

	async create(input: CreateOrgMembershipInput): Promise<OrgMembership> {
		if (await this.findByOrgAndUser(input.orgId, input.userId)) throw new Error('duplicate key value violates unique constraint "org_memberships_org_id_user_id_key"');
		const now = new Date();
		const membership: OrgMembership = {
			id: randomUUID(),
			orgId: input.orgId,
			userId: input.userId,
			roleKey: input.roleKey,
			status: 'active',
			clerkMembershipId: input.clerkMembershipId ?? null,
			createdAt: now,
			updatedAt: now,
			removedAt: null,
		};
		this.rows.push(membership);
		return membership;
	}

	async updateRole(orgId: string, userId: string, roleKey: OrgRoleKey): Promise<OrgMembership | undefined> {
		if (roleKey !== 'owner') this.assertNotLastOwner(orgId, userId);
		const membership = this.rows.find((m) => m.orgId === orgId && m.userId === userId && m.status !== 'removed');
		if (!membership) return undefined;
		membership.roleKey = roleKey;
		membership.updatedAt = new Date();
		return membership;
	}

	async markRemoved(orgId: string, userId: string): Promise<boolean> {
		this.assertNotLastOwner(orgId, userId);
		const membership = this.rows.find((m) => m.orgId === orgId && m.userId === userId && m.status !== 'removed');
		if (!membership) return false;
		this.projectMemberships?.removeAllForUser(orgId, userId);
		membership.status = 'removed';
		membership.removedAt = new Date();
		membership.updatedAt = membership.removedAt;
		return true;
	}

	async reactivate(orgId: string, userId: string, roleKey: OrgRoleKey): Promise<OrgMembership | undefined> {
		const membership = this.rows.find((m) => m.orgId === orgId && m.userId === userId && m.status === 'removed');
		if (!membership) return undefined;
		membership.status = 'active';
		membership.roleKey = roleKey;
		membership.removedAt = null;
		membership.updatedAt = new Date();
		return membership;
	}

	async lockOrganization(): Promise<boolean> {
		return true;
	}

	private assertNotLastOwner(orgId: string, userId: string): void {
		const owners = this.rows.filter((m) => m.orgId === orgId && m.roleKey === 'owner' && m.status === 'active');
		if (owners.length === 1 && owners[0]?.userId === userId) throw new LastOwnerError();
	}
}

export class InMemoryProjectMembershipRepository implements ProjectMembershipRepository {
	readonly rows: ProjectMembership[] = [];

	constructor(private readonly users?: InMemoryUserRepository) {}

	async findByProjectAndUser(projectId: string, userId: string): Promise<ProjectMembership | undefined> {
		return this.rows.find((m) => m.projectId === projectId && m.userId === userId);
	}

	async listByProject(projectId: string): Promise<ProjectMember[]> {
		return this.rows
			.filter((m) => m.projectId === projectId)
			.map((m) => {
				const user = this.users?.rows.get(m.userId);
				return { ...m, email: user?.email ?? null, displayName: user?.displayName ?? null, avatarUrl: user?.avatarUrl ?? null };
			});
	}

	async upsert(input: UpsertProjectMembershipInput): Promise<{ membership: ProjectMembership; previousRoleKey: string | undefined }> {
		const existing = await this.findByProjectAndUser(input.projectId, input.userId);
		if (existing) {
			const previousRoleKey = existing.roleKey;
			existing.roleKey = input.roleKey;
			existing.updatedAt = new Date();
			return { membership: existing, previousRoleKey };
		}
		const now = new Date();
		const membership: ProjectMembership = {
			id: randomUUID(),
			orgId: input.orgId,
			projectId: input.projectId,
			userId: input.userId,
			roleKey: input.roleKey,
			addedByUserId: input.addedByUserId ?? null,
			createdAt: now,
			updatedAt: now,
		};
		this.rows.push(membership);
		return { membership, previousRoleKey: undefined };
	}

	async remove(projectId: string, userId: string): Promise<ProjectMembership | undefined> {
		const index = this.rows.findIndex((m) => m.projectId === projectId && m.userId === userId);
		return index === -1 ? undefined : this.rows.splice(index, 1)[0];
	}

	/** Mirrors the ON DELETE CASCADE from org_memberships. */
	removeAllForUser(orgId: string, userId: string): void {
		for (let i = this.rows.length - 1; i >= 0; i--) {
			if (this.rows[i]?.orgId === orgId && this.rows[i]?.userId === userId) this.rows.splice(i, 1);
		}
	}
}
