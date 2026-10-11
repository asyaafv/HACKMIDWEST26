/** Local setup writes secrets only to ignored .env; registration prints only the webhook ID. */
import { readFile,writeFile,chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const path='.env';
const mode=process.argv[2];
try {
 let env=await readFile(path,'utf8');
 const value=(key:string)=>env.split(/\r?\n/).find(line=>line.startsWith(`${key}=`))?.slice(key.length+1).trim();
 const put=(key:string,value:string)=>{
  const lines=env.split(/\r?\n/);const index=lines.findIndex(line=>line.startsWith(`${key}=`));
  if(index>=0)lines[index]=`${key}=${value}`;else lines.push(`${key}=${value}`);env=lines.join('\n');
 };
 if(mode==='prepare'){
  const base=new URL(process.argv[3]??'');
  if(base.protocol!=='https:'||base.username||base.password||['localhost','127.0.0.1','::1'].includes(base.hostname))throw new Error('PUBLIC_HTTPS_REQUIRED');
  const url=new URL('/v1/integrations/devrev/trust/webhook',base).href;
  if(!value('DEVREV_TRUST_WEBHOOK_SECRET'))put('DEVREV_TRUST_WEBHOOK_SECRET',randomBytes(32).toString('hex'));
  put('DEVREV_TRUST_WEBHOOK_URL',url);
  if(!value('DEVREV_TRUST_ENABLED'))put('DEVREV_TRUST_ENABLED','false');
  await writeFile(path,env.endsWith('\n')?env:env+'\n',{mode:0o600});await chmod(path,0o600);
  console.log('Prepared private .env settings. Copy the token, agent ID and webhook secret privately into Render; keep trust disabled until registration succeeds.');
 }else if(mode==='register'){
  const token=process.env.DEVREV_API_TOKEN,secret=process.env.DEVREV_TRUST_WEBHOOK_SECRET,url=process.env.DEVREV_TRUST_WEBHOOK_URL;
  if(!token||!secret||secret.length<32||!url||new URL(url).protocol!=='https:')throw new Error('MISSING_PRIVATE_CONFIGURATION');
  if(value('DEVREV_TRUST_WEBHOOK_ID'))throw new Error('WEBHOOK_ALREADY_REGISTERED');
  // Registration must wait for deployment of the authenticated callback route.
  const ready=await fetch(new URL('/health',url),{redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!ready.ok||(await ready.json() as any).trust?.webhookConfigured!==true)throw new Error('DEPLOY_CALLBACK_FIRST');
  const result=await fetch('https://api.devrev.ai/internal/webhooks.create',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
   body:JSON.stringify({url,event_types:['ai_agent_response'],headers:[{name:'x-api-key',value:secret}]}),
  });
  if(!result.ok)throw new Error('DEVREV_REGISTRATION_FAILED');
  const response=await result.json() as any,id=response.webhook?.id;
  if(typeof id!=='string'||!/^don:integration:[^:]+:devo\/[^:]+:webhook\/[^:]+$/.test(id))throw new Error('WEBHOOK_ID_MISSING');
  put('DEVREV_TRUST_WEBHOOK_ID',id);await writeFile(path,env.endsWith('\n')?env:env+'\n',{mode:0o600});await chmod(path,0o600);
  console.log(`Webhook registered: ${id}. Saved to private .env. Set this ID in Render, verify webhook delivery, then enable trust in Render.`);
 }else throw new Error('USE_PREPARE_OR_REGISTER');
}catch(error){
 const allowed=['PUBLIC_HTTPS_REQUIRED','MISSING_PRIVATE_CONFIGURATION','WEBHOOK_ALREADY_REGISTERED','DEPLOY_CALLBACK_FIRST','DEVREV_REGISTRATION_FAILED','WEBHOOK_ID_MISSING','USE_PREPARE_OR_REGISTER'];
 console.error(error instanceof Error&&allowed.includes(error.message)?error.message:'TRUST_SETUP_FAILED');process.exitCode=1;
}
