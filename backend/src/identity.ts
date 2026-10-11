/** Administrative provisioning uses a migration/admin connection, never a finance bearer. */
import { randomBytes,randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction,type DB } from './db.js';
import { secretHash } from './hash.js';
import { hashPassword } from './sessions.js';
import { appendAudit } from './audit.js';
import { requireThat } from './errors.js';
export const gatekeeperProvisionSchema=z.object({orgId:z.string().uuid(),projectId:z.string().uuid(),name:z.string().min(1).max(200),
 investigator:z.boolean().default(false),expiresInHours:z.number().int().min(1).max(168).default(24),capMinor:z.string().regex(/^[1-9][0-9]{0,7}$/).default('500000')}).strict();
export async function provisionGatekeeper(db:DB,input:unknown) {
 const options=gatekeeperProvisionSchema.parse(input);
 const principalId=randomUUID(),agentId=randomUUID(),credentialId=randomUUID(),token=randomBytes(32).toString('hex');
 const capabilities=['catalog:read','context:read','request:read','request:preview','payment:read',...(options.investigator?['investigation:write']:['request:submit'])];
 await transaction(db,options.orgId,async tx=>{
  requireThat((await tx.query('SELECT 1 FROM projects WHERE org_id=$1 AND id=$2',[options.orgId,options.projectId])).rowCount,'NOT_FOUND','Project not found.',404);
  await tx.query("INSERT INTO principals(id,org_id,name,role) VALUES($1,$2,$3,'AGENT')",[principalId,options.orgId,options.name]);
  await tx.query('INSERT INTO principal_projects VALUES($1,$2,$3)',[options.orgId,principalId,options.projectId]);
  // Existing services bind AGENT identity through owner_id; no human impersonation.
  await tx.query('INSERT INTO agents(id,org_id,owner_id,project_id,name,cap_minor) VALUES($1,$2,$3,$4,$5,$6)',[agentId,options.orgId,principalId,options.projectId,options.name,options.capMinor]);
  await tx.query("INSERT INTO credentials(id,org_id,principal_id,token_hash,expires_at,capabilities) VALUES($1,$2,$3,$4,now()+($5 * interval '1 hour'),$6)",[credentialId,options.orgId,principalId,secretHash(token),options.expiresInHours,capabilities]);
  await appendAudit(tx,options.orgId,null,'identity.gatekeeper_provisioned',principalId,{agentId,credentialId,projectId:options.projectId,capabilities,expiresInHours:options.expiresInHours});
 });
 return {principalId,agentId,credentialId,orgId:options.orgId,projectId:options.projectId,capabilities,token};
}
export async function revokeCredential(db:DB,orgId:string,credentialId:string) {
 z.string().uuid().parse(orgId); z.string().uuid().parse(credentialId);
 return transaction(db,orgId,async tx=>{
  const result=await tx.query('UPDATE credentials SET revoked_at=now() WHERE org_id=$1 AND id=$2',[orgId,credentialId]);
  requireThat(result.rowCount,'NOT_FOUND','Credential not found.',404);
  await appendAudit(tx,orgId,null,'identity.credential_revoked',credentialId,{});
  return result;
 });
}
export async function provisionHumanLogin(db:DB,orgId:string,principalId:string,username:string,password:string) {
 z.string().uuid().parse(orgId);z.string().uuid().parse(principalId);z.string().min(1).max(200).parse(username);
 const encoded=await hashPassword(password);
 await transaction(db,orgId,async tx=>{
  requireThat((await tx.query("SELECT 1 FROM principals WHERE org_id=$1 AND id=$2 AND active AND role<>'AGENT'",[orgId,principalId])).rowCount,'FORBIDDEN','Active human principal required.',403);
  await tx.query('INSERT INTO human_logins VALUES($1,$2,$3,$4) ON CONFLICT(org_id,principal_id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash',[orgId,principalId,username,encoded]);
  // Password replacement revokes existing sessions.
  await tx.query('UPDATE browser_sessions SET revoked_at=now() WHERE org_id=$1 AND principal_id=$2',[orgId,principalId]);
  await appendAudit(tx,orgId,null,'identity.human_login_provisioned',principalId,{priorSessionsRevoked:true});
 });
}
