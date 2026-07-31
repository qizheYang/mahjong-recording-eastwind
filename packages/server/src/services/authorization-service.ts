import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { getAdminFromHeader } from './admin-service.js';

/** Validate the existing database-backed administrator session. */
export function authorizeAdmin(authHeader: string | undefined): string | null {
  return getAdminFromHeader(authHeader);
}

/** Create an opaque, high-entropy bearer capability and its server-side digest. */
export function issueCapability(): { token: string; digest: Buffer } {
  const token = randomBytes(32).toString('base64url');
  return { token, digest: digestCapability(token) };
}

/** Verify a bearer capability without retaining the bearer value in memory. */
export function verifyCapability(token: string | undefined, expectedDigest: Buffer): boolean {
  if (!token) return false;
  const actualDigest = digestCapability(token);
  return timingSafeEqual(actualDigest, expectedDigest);
}

function digestCapability(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}
