import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newReport, REQUEST_ID } from '../scripts/devrev-agent-smoke.mjs';

test('isolated HTTP collector authenticates real verify shape and rejects mismatched callbacks', async () => {
  const dir=await mkdtemp(join(tmpdir(),'gate-smoke-test-'));
  const path=join(dir,'report.json'), report=newReport(), secret='fixture-only-not-a-real-credential';
  const agent=report.agents[0];agent.invocation='ACCEPTED';agent.sessionId='don:core:dvrv-us-1:devo/17WZM4zcjj:ai_agent_session/fixture';
  await writeFile(path,JSON.stringify(report));
  const child=spawn(process.execPath,[fileURLToPath(new URL('../scripts/devrev-agent-smoke.mjs',import.meta.url)),'listen',path],{
    windowsHide:true,env:{...process.env,GATE_DEVREV_WEBHOOK_SECRET:secret,GATE_DEVREV_SMOKE_PORT:'0'},stdio:['ignore','pipe','pipe']});
  try {
    const url=await new Promise((resolve,reject)=> {
      const timeout=setTimeout(()=>reject(new Error('collector startup timeout')),5000);
      child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/127\.0\.0\.1:\d+\/callback/);if(match){clearTimeout(timeout);resolve(match[0]);}});
      child.once('error',reject);
    });
    const post=(body,auth=secret)=>fetch(url,{method:'POST',headers:{'x-api-key':auth,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post({},'wrong')).status,401);
    const verify=await post({type:'verify',verify:{challenge:'actual-devrev-shape'}});
    assert.equal(verify.status,200);assert.deepEqual(await verify.json(),{challenge:'actual-devrev-shape'});
    const event={payload:{ai_agent_response:{agent:agent.agentId,session:agent.sessionId,session_object:agent.sessionObject,
      client_metadata:{phase:'gate-smoke-1',runId:report.runId,requestId:REQUEST_ID},agent_response:'message',message:'Completed.'}}};
    const bad=structuredClone(event);bad.payload.ai_agent_response.client_metadata.runId='wrong';
    assert.equal((await post(bad)).status,400);
    assert.equal((await post(event)).status,200);
    const saved=JSON.parse(await readFile(`${path}.callbacks.json`,'utf8'));
    assert.equal(saved.agents[0].events.length,1);
    const rejected=JSON.parse(await readFile(`${path}.rejections.json`,'utf8'));
    assert.equal(rejected.rejected[0].reason,'CALLBACK_BINDING_MISMATCH');
  } finally {
    if(child.exitCode===null) {const ended=new Promise(resolve=>child.once('exit',resolve));child.kill();await ended;}
    for(const suffix of ['', '.callbacks.json', '.rejections.json'])await unlink(path+suffix).catch(()=>{});
    await rmdir(dir);
  }
});
