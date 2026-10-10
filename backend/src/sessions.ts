/** Passwords use Node scrypt; opaque sessions bind CSRF and never authenticate MCP. */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { FastifyRequest } from 'fastify';
import type { DB } from './db.js';
import { authenticate } from './auth.js';
import { secretHash } from './hash.js';
import { requireThat } from './errors.js';
import { normalizeCapabilities, type ScopedPrincipal } from './capabilities.js';
const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = '__Host-gate_session';
export async function hashPassword(password: string) {
 requireThat(password.length >= 12 && password.length <= 256, 'INVALID_PASSWORD', 'Password must contain 12–256 characters.', 400);
 const salt = randomBytes(16).toString('hex');
 return `scrypt:${salt}:${(await scrypt(password, salt, 64) as Buffer).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
 const [algorithm,salt,digest] = encoded.split(':');
 if (algorithm !== 'scrypt' || !salt || !digest || !/^[a-f0-9]{128}$/.test(digest)) return false;
 const actual = await scrypt(password, salt, 64) as Buffer;
 return timingSafeEqual(actual, Buffer.from(digest,'hex'));
}
export function sessionToken(req: FastifyRequest) {
 const cookies = (req.headers.cookie ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${SESSION_COOKIE}=`));
 requireThat(cookies.length === 1, 'UNAUTHENTICATED', 'A valid session is required.', 401);
 const token = cookies[0]!.slice(SESSION_COOKIE.length + 1);
 requireThat(/^[a-f0-9]{64}$/.test(token), 'UNAUTHENTICATED', 'Invalid session.', 401);
 return token;
}
export function checkBrowserBoundary(req: FastifyRequest, origins: string[], hosts: string[]) {
 requireThat(hosts.includes(req.headers.host ?? ''), 'HOST_FORBIDDEN', 'Host not allowed.', 403);
 requireThat(typeof req.headers.origin === 'string' && origins.includes(req.headers.origin), 'ORIGIN_FORBIDDEN', 'Exact browser Origin required.', 403);
}
export async function httpAuthenticate(db: DB, req: FastifyRequest, origins: string[], hosts: string[]): Promise<ScopedPrincipal> {
 if (req.headers.authorization) return authenticate(db, req.headers.authorization);
 const token=sessionToken(req);
 requireThat(hosts.includes(req.headers.host ?? ''), 'HOST_FORBIDDEN', 'Host not allowed.', 403);
 const row = (await db.query('SELECT * FROM gate_session_lookup($1)', [secretHash(token)])).rows[0];
 requireThat(row, 'UNAUTHENTICATED', 'Invalid or expired session.', 401);
 if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
  checkBrowserBoundary(req, origins, hosts);
  const csrf = req.headers['x-csrf-token'];
  requireThat(typeof csrf === 'string' && /^[a-f0-9]{64}$/.test(csrf) && timingSafeEqual(Buffer.from(secretHash(csrf)),Buffer.from(row.csrf_hash)), 'CSRF_FORBIDDEN', 'Valid CSRF token required.', 403);
 }
 const capabilities = (await db.query('SELECT gate_credential_capabilities($1) AS capabilities',[row.credential_id])).rows[0]?.capabilities;
 requireThat(capabilities, 'UNAUTHENTICATED', 'Invalid session.', 401);
 return { id:row.id, orgId:row.org_id, credentialId:row.credential_id, role:row.role, approvalLimitMinor:row.approval_limit_minor, capabilities:normalizeCapabilities(capabilities), authMethod:'session' };
}
