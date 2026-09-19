import type { User, UserProfile } from './user.entity.js';

export interface UserRepository {
	/**
	 * Returns the user for a Clerk id, creating it on first sight. `created`
	 * tells the caller whether to go fetch the profile from Clerk.
	 */
	upsertByClerkId(clerkUserId: string): Promise<{ user: User; created: boolean }>;
	findById(id: string): Promise<User | undefined>;
	findByClerkId(clerkUserId: string): Promise<User | undefined>;
	/** Only the provided fields change; `undefined` leaves a column untouched. */
	updateProfile(id: string, profile: UserProfile): Promise<void>;
	touchLastSeen(id: string): Promise<void>;
	/** Marks the user deactivated and scrubs PII. Returns false if no such user. */
	deactivateByClerkId(clerkUserId: string): Promise<boolean>;
}
