/** Secrets are written once to an exclusive private file; stdout contains IDs only. */
import { readFile,writeFile } from 'node:fs/promises';
import { Pool } from '../src/db.js';
import { provisionGatekeeper,provisionHumanLogin,revokeCredential } from '../src/identity.js';
const db=new Pool({connectionString:process.env.DATABASE_URL});
try {
 const command=process.argv[2], inputFile=process.argv[3];
 if (!inputFile) throw new Error('Usage: provision-gatekeeper.ts agent|human|revoke INPUT_JSON [PRIVATE_OUTPUT_FILE]');
 const input=JSON.parse(await readFile(inputFile,'utf8'));
 if(command==='agent') {
  const output=process.argv[4];if(!output) throw new Error('Private output file required');
  // Reserve destination before database mutation; never overwrite prior credentials.
  const {open}=await import('node:fs/promises');const file=await open(output,'wx',0o600);
  try {const result=await provisionGatekeeper(db,input);await file.writeFile(JSON.stringify(result,null,2));console.log({principalId:result.principalId,agentId:result.agentId,credentialId:result.credentialId});} finally {await file.close();}
 } else if(command==='human') {
  await provisionHumanLogin(db,input.orgId,input.principalId,input.username,input.password);console.log('Human login provisioned.');
 } else if(command==='revoke') {
  await revokeCredential(db,input.orgId,input.credentialId);console.log('Credential revocation applied.');
 } else throw new Error('Unknown provisioning command');
} catch { console.error('Provisioning failed; verify private input and database configuration.');process.exitCode=1; }
finally {await db.end();}
