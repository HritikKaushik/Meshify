import type { VaultHandle } from '../base/context.js';
import type { CredentialStore, SecretCipher } from './credential-store.port.js';

/**
 * The only component that reads or writes integration credentials. Values are
 * encrypted before they reach the store and decrypted only at the point of
 * use; nothing above the vault ever sees ciphertext, nothing below it ever
 * sees plaintext.
 */
export class CredentialVault {
	constructor(
		private readonly store: CredentialStore,
		private readonly cipher: SecretCipher,
		private readonly now: () => Date = () => new Date()
	) {}

	async put(integrationId: string, kind: string, value: string, expiresAt?: Date | null): Promise<void> {
		await this.store.upsert({ integrationId, kind, encryptedValue: this.cipher.encrypt(value), expiresAt: expiresAt ?? null });
	}

	/**
	 * Fetch + decrypt a credential. With `minTtlMs`, a credential expiring
	 * sooner than the margin is treated as absent — callers mint/refresh and
	 * `put` the replacement (the DB-cached-installation-token pattern).
	 */
	async get(integrationId: string, kind: string, opts?: { minTtlMs?: number }): Promise<{ value: string; expiresAt: Date | null } | undefined> {
		const stored = await this.store.findByIntegrationAndKind(integrationId, kind);
		if (!stored) return undefined;
		if (stored.expiresAt) {
			const remaining = stored.expiresAt.getTime() - this.now().getTime();
			if (remaining <= (opts?.minTtlMs ?? 0)) return undefined;
		}
		return { value: this.cipher.decrypt(stored.encryptedValue), expiresAt: stored.expiresAt };
	}

	async delete(integrationId: string, kind: string): Promise<void> {
		await this.store.delete(integrationId, kind);
	}

	/** Remove every credential of an integration (disconnect teardown). */
	async purge(integrationId: string): Promise<void> {
		await this.store.deleteAllForIntegration(integrationId);
	}

	/** Scope the vault to one integration — the only form providers ever receive. */
	forIntegration(integrationId: string): VaultHandle {
		return {
			get: (kind, opts) => this.get(integrationId, kind, opts),
			put: (kind, value, expiresAt) => this.put(integrationId, kind, value, expiresAt),
			delete: (kind) => this.delete(integrationId, kind),
		};
	}
}
