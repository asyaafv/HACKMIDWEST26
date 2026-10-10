/** Exported browser routes require Chat 4 registration; HTTPS cookies never carry bearer secrets. */
import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { transaction, type DB } from '../db.js';
import { appendAudit } from '../audit.js';
import { secretHash } from '../hash.js';
import { requireThat } from '../errors.js';
import { checkBrowserBoundary, hashPassword, verifyPassword, httpAuthenticate, sessionToken, SESSION_COOKIE } from '../sessions.js';
const dummyHash = hashPassword(randomBytes(32).toString('hex'));
export const authRoutes: FastifyPluginAsync<{db:DB; origins:string[]; hosts:string[]}> = async (app, options) => {
 app.post('/auth/login', { config:{ rateLimit:{ max:5,timeWindow:'1 minute' } } }, async (req,reply) => {
  checkBrowserBoundary(req,options.origins,options.hosts);
  const input = z.object({username:z.string().min(1).max(200),password:z.string().min(1).max(256)}).strict().parse(req.body);
  const row = (await options.db.query('SELECT * FROM gate_login_lookup($1)',[input.username])).rows[0];
  const valid = await verifyPassword(input.password,row?.password_hash ?? await dummyHash);
  requireThat(row && valid,'UNAUTHENTICATED','Invalid login.',401);
  const token=randomBytes(32).toString('hex'), csrf=randomBytes(32).toString('hex');
  const credentialId=randomUUID();
  await transaction(options.db,row.org_id,async tx=>{
   await tx.query('SELECT gate_issue_session($1,$2,$3,$4,$5,$6)',[row.id,row.org_id,randomUUID(),credentialId,secretHash(token),secretHash(csrf)]);
   await appendAudit(tx,row.org_id,row.id,'identity.session_started',credentialId,{});
  });
  reply.header('Cache-Control','no-store').header('Set-Cookie',`${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`);
  return {data:{csrfToken:csrf,expiresIn:28800}};
 });
 app.get('/auth/me', async (req,reply) => {
  const p=await httpAuthenticate(options.db,req,options.origins,options.hosts);
  const projects=await transaction(options.db,p.orgId,async tx=>(await tx.query('SELECT project_id FROM principal_projects WHERE org_id=$1 AND principal_id=$2',[p.orgId,p.id])).rows);
  reply.header('Cache-Control','no-store');
  return {data:{id:p.id,orgId:p.orgId,role:p.role,capabilities:p.capabilities,projects,mode:'sandbox'}};
 });
 app.post('/auth/logout', async (req,reply) => {
  // Logout is cookie-only so a bearer header cannot bypass CSRF validation.
  requireThat(!req.headers.authorization,'INVALID_REQUEST','Use the browser session for logout.',400);
  const p=await httpAuthenticate(options.db,req,options.origins,options.hosts);
  await transaction(options.db,p.orgId,async tx=>{
   await tx.query('UPDATE browser_sessions SET revoked_at=now() WHERE token_hash=$1 AND principal_id=$2',[secretHash(sessionToken(req)),p.id]);
   await appendAudit(tx,p.orgId,p.id,'identity.session_revoked',p.credentialId,{});
  });
  reply.header('Cache-Control','no-store').header('Set-Cookie',`${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`);
  return {data:{loggedOut:true}};
 });
};
