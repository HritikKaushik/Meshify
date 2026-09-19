import type { Queryable } from '../db/queryable.js';
import type { User, UserProfile } from './user.entity.js';
import type { UserRepository } from './user.repository.js';

interface UserRow {
	id: string;
	clerk_user_id: string;
	email: string | null;
	display_name: string | null;
	avatar_url: string | null;
	last_seen_at: Date | null;
	deactivated_at: Date | null;
	created_at: Date;
	updated_at: Date;
}

const USER_COLUMNS = 'id, clerk_user_id, email, display_name, avatar_url, last_seen_at, deactivated_at, created_at, updated_at';

function toDomain(row: UserRow): User {
	return {
		id: row.id,
		clerkUserId: row.clerk_user_id,
		email: row.email,
		displayName: row.display_name,
		avatarUrl: row.avatar_url,
		lastSeenAt: row.last_seen_at,
		deactivatedAt: row.deactivated_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export class PostgresUserRepository implements UserRepository {
	constructor(private readonly pool: Queryable) {}

	async upsertByClerkId(clerkUserId: string): Promise<{ user: User; created: boolean }> {
		// The no-op DO UPDATE makes RETURNING yield the existing row on conflict;
		// `xmax = 0` is true only for a row this statement inserted.
		const { rows } = await this.pool.query<UserRow & { created: boolean }>(
			`insert into users (clerk_user_id) values ($1)
			 on conflict (clerk_user_id) do update set clerk_user_id = excluded.clerk_user_id
			 returning ${USER_COLUMNS}, (xmax = 0) as created`,
			[clerkUserId]
		);
		const row = rows[0];
		if (!row) throw new Error('Upsert into users returned no row');
		return { user: toDomain(row), created: row.created };
	}

	async findById(id: string): Promise<User | undefined> {
		const { rows } = await this.pool.query<UserRow>(`select ${USER_COLUMNS} from users where id = $1`, [id]);
		return rows[0] ? toDomain(rows[0]) : undefined;
	}

	async findByClerkId(clerkUserId: string): Promise<User | undefined> {
		const { rows } = await this.pool.query<UserRow>(`select ${USER_COLUMNS} from users where clerk_user_id = $1`, [clerkUserId]);
		return rows[0] ? toDomain(rows[0]) : undefined;
	}

	async updateProfile(id: string, profile: UserProfile): Promise<void> {
		// A `$n::boolean` flag per column distinguishes "leave as is" (undefined)
		// from "set to null", which coalesce() alone cannot express.
		await this.pool.query(
			`update users set
				email = case when $2::boolean then $3 else email end,
				display_name = case when $4::boolean then $5 else display_name end,
				avatar_url = case when $6::boolean then $7 else avatar_url end,
				updated_at = now()
			 where id = $1`,
			[
				id,
				profile.email !== undefined,
				profile.email ?? null,
				profile.displayName !== undefined,
				profile.displayName ?? null,
				profile.avatarUrl !== undefined,
				profile.avatarUrl ?? null,
			]
		);
	}

	async touchLastSeen(id: string): Promise<void> {
		await this.pool.query('update users set last_seen_at = now() where id = $1', [id]);
	}

	async deactivateByClerkId(clerkUserId: string): Promise<boolean> {
		const { rowCount } = await this.pool.query(
			`update users set deactivated_at = coalesce(deactivated_at, now()), email = null, display_name = null, avatar_url = null, updated_at = now()
			 where clerk_user_id = $1`,
			[clerkUserId]
		);
		return (rowCount ?? 0) > 0;
	}
}
