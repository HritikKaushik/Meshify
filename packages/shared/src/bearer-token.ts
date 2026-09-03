import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time check of an `Authorization: Bearer <token>` header against
 * the expected token. Hashing both sides first makes the comparison
 * length-independent, so neither the token's length nor its prefix leaks
 * through response timing. A missing or malformed header never matches.
 */
export function bearerTokenMatches(authorizationHeader: string | undefined, expectedToken: string): boolean {
	if (!authorizationHeader || !expectedToken) return false;
	const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader.trim());
	if (!match?.[1]) return false;
	const presented = createHash('sha256').update(match[1].trim()).digest();
	const expected = createHash('sha256').update(expectedToken).digest();
	return timingSafeEqual(presented, expected);
}
