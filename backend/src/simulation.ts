/** Runs a demo purchasing agent through the real evidence/policy engine without executing payments. */
import type { DB } from './db.js';
import { transaction } from './db.js';
import type { Principal } from './contracts.js';
import { proposalSchema } from './contracts.js';
import { projectAccess } from './auth.js';
import { requireThat } from './errors.js';
import type { GateService } from './service.js';

export async function simulatePurchase(db: DB, service: GateService, reviewer: Principal, input: unknown, key: string) {
  const proposal = proposalSchema.parse(input);
  const owner = await transaction(db, reviewer.orgId, async tx => {
    await projectAccess(tx,reviewer,proposal.projectId);
    // The browser chooses an agent, never an identity or credential. Scope is resolved server-side.
    // The existing credential ID is a provenance foreign key; no bearer token is used.
    const row = (await tx.query(`SELECT p.*,c.id AS credential_id FROM agents a
      JOIN principals p ON p.org_id=a.org_id AND p.id=a.owner_id
      JOIN credentials c ON c.org_id=p.org_id AND c.principal_id=p.id
      WHERE a.org_id=$1 AND a.id=$2 AND a.project_id=$3 AND a.active AND p.active
      AND p.role IN ('OPERATOR','AGENT') AND c.revoked_at IS NULL AND 'request:submit'=ANY(c.capabilities)
      ORDER BY c.expires_at DESC,c.id LIMIT 1`, [reviewer.orgId,proposal.agentId,proposal.projectId])).rows[0];
    requireThat(row,'SIMULATION_UNAVAILABLE','This purchasing agent is not ready for simulation.',422);
    await projectAccess(tx,{...reviewer,id:row.id},proposal.projectId);
    return {id:row.id,orgId:reviewer.orgId,role:row.role,credentialId:row.credential_id,
      approvalLimitMinor:row.approval_limit_minor,capabilities:['request:submit']} as Principal;
  });
  return service.create(owner,proposal,key,'SIMULATED_PURCHASE');
}
