/** Mock transport contracts; these tests are not live DevRev execution evidence. */
import {afterEach,it,expect,vi} from 'vitest';
import {api,BackendService} from '../../src/backend-service';
import {startCoordinatorReview,latestCoordinatorRun} from '../../src/orchestration-api';
const requestId='9de772b5-4c6f-41b1-9510-46eb74ac28b9';
const identity={id:'operator',orgId:'fixture-org',role:'OPERATOR',capabilities:['request:read','catalog:read']};
const dashboard={identity:{...identity,role:'FINANCE'},catalog:{agents:[],projects:[],merchants:[],budgets:[],policy:{}},requests:[],events:[]};
afterEach(()=>{api.clear();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('uses authenticated dashboard identity and never sends a Gate bearer credential',async()=>{
 const fetcher=vi.fn(async(url:string)=>new Response(JSON.stringify({data:url.endsWith('/auth/me')?identity:dashboard})));
 vi.stubGlobal('fetch',fetcher);
 const result=await new BackendService().load();expect(result.identity).toMatchObject({...identity,authenticated:true});
 expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/v1/auth/me','/v1/dashboard']);
 expect((fetcher.mock.calls[0] as unknown as [string,RequestInit])[1].headers).not.toHaveProperty('Authorization');
});
it('only falls back to existing shared demo reads for HTTP 401, not backend failures',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{code:'UNAUTHENTICATED'}}),{status:401})).mockResolvedValueOnce(new Response(JSON.stringify({data:dashboard})));
 vi.stubGlobal('fetch',fetcher);expect((await new BackendService().load()).identity?.authenticated).toBe(false);
 expect(fetcher.mock.calls[1][0]).toBe('/v1/demo/dashboard');
 fetcher.mockReset().mockResolvedValue(new Response(JSON.stringify({error:{code:'DEPENDENCY_FAILURE'}}),{status:503}));
 await expect(new BackendService().load()).rejects.toMatchObject({code:'DEPENDENCY_FAILURE'});expect(fetcher).toHaveBeenCalledTimes(1);
});
it('starts only an existing request review, keeps its mutation key after a lost response, and retrieves actual run IDs',async()=>{
 api.csrf='fixture-csrf';
 const fetcher=vi.fn().mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce(new Response(JSON.stringify({data:{runId:'actual-run-id'}})))
  .mockResolvedValueOnce(new Response(JSON.stringify({data:{items:[{id:'actual-run-id'}]}})))
  .mockResolvedValueOnce(new Response(JSON.stringify({data:{run:{id:'actual-run-id',status:'RUNNING'},stages:[],events:[]}})));
 vi.stubGlobal('fetch',fetcher);
 await expect(startCoordinatorReview(requestId,1)).rejects.toThrow('Response lost');
 expect(await startCoordinatorReview(requestId,1)).toEqual({runId:'actual-run-id'});
 expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
 expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({requestId});
 expect(fetcher.mock.calls[1][1].headers).toMatchObject({'X-CSRF-Token':'fixture-csrf'});
 expect((await latestCoordinatorRun(requestId))?.run.id).toBe('actual-run-id');
 expect(fetcher.mock.calls.map(c=>c[0])).toEqual(['/v1/orchestrations','/v1/orchestrations',`/v1/requests/${requestId}/orchestrations`,'/v1/orchestrations/actual-run-id']);
});
it('reports proxy HTML instead of treating it as backend success',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('<html>SPA fallback</html>')));
 await expect(api.call('/auth/me')).rejects.toThrow('/v1 proxy');
});
it('records a finance approval through preview and review only; unauthenticated decisions are refused',async()=>{
 const id='9de772b5-4c6f-41b1-9510-46eb74ac28b9';
 const identity={id:'finance-user',orgId:'org',role:'FINANCE',capabilities:['request:read','catalog:read','finance:consent']};
 const record={id,version:4,createdAt:'2026-10-10T12:00:00Z',proposal:{agentId:'agent',projectId:'project',merchantId:'merchant',amountMinor:'100010',currency:'USD',category:'diagnostics',purpose:'Verified fixture request',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}},workflowStatus:'AWAITING_CONSENT',consentStatus:'NONE',authorizationStatus:'NONE',decision:{verdict:'REVIEW',riskScore:20,executionAllowed:true,requiresHumanConsent:true,policyVersion:'test',rules:[],factors:[],reviewRequirements:[{code:'AMOUNT_REQUIRES_REVIEW',resolution:'HUMAN_JUDGMENT'}]},evidence:{items:[],missing:[],links:[],bundleHash:'a'.repeat(64),complete:true,unresolvedRequirements:[]},payment:null,snapshotHash:'b'.repeat(64),transactionReview:null,investigation:{status:'EVALUATED'}};
 const dashboard={identity,catalog:{agents:[{id:'agent',name:'Agent',active:true,project_id:'project',owner_id:'other',cap_minor:'500000'}],projects:[{id:'project',name:'Project'}],merchants:[{id:'merchant',name:'Vendor',status:'ALLOWED'}],budgets:[],policy:{}},requests:[record],events:[]};
 const service=new BackendService();
 vi.spyOn(api,'call').mockImplementation(async(path:string,body?:unknown,action?:string)=>{
  if(path==='/auth/me')return identity as never;
  if(path==='/dashboard')return dashboard as never;
  if(path===`/requests/${id}/preview`)return {id:'preview',previewHash:'c'.repeat(64),expectedVersion:5,decision:{reviewRequirements:[{code:'AMOUNT_REQUIRES_REVIEW',resolution:'HUMAN_JUDGMENT'}]}} as never;
  if(path===`/requests/${id}/review`)return {workflowStatus:'AUTHORIZED',paymentExecution:false} as never;
  throw new Error(`Unexpected API call ${path} ${JSON.stringify(body)} ${action}`);
 });
 const transaction=(await service.load()).transactions[0];
 await expect(new BackendService().reviewTransaction(transaction,'approve','Finance reviewed the evidence','unauthenticated')).rejects.toThrow('Sign in');
 expect(transaction.canApprove).toBe(true);
 await expect(service.reviewTransaction(transaction,'approve','Finance reviewed the evidence','test-approval')).resolves.toBeDefined();
 const calls=vi.mocked(api.call).mock.calls;
 expect(calls.map(([path])=>path)).toEqual(['/auth/me','/dashboard',`/requests/${id}/preview`,`/requests/${id}/review`,'/auth/me','/dashboard']);
 expect(calls[2][1]).toEqual({});
 expect(calls[3][1]).toMatchObject({choice:'approve',previewId:'preview',previewHash:'c'.repeat(64),expectedVersion:5,reviewResolutions:['AMOUNT_REQUIRES_REVIEW']});
 expect(calls[3][2]).toBe('test-approval:record');
 expect(calls.some(([path])=>path.includes('/consent'))).toBe(false);
});
it('records a rejection through the authenticated pending-request endpoint',async()=>{
 const id='9de772b5-4c6f-41b1-9510-46eb74ac28b9',identity={id:'finance-user',orgId:'org',role:'FINANCE',capabilities:['finance:consent']};
 const record={id,version:2,createdAt:'2026-10-10T12:00:00Z',proposal:{agentId:'agent',projectId:'project',merchantId:'merchant',amountMinor:'100010',currency:'USD',category:'diagnostics',purpose:'Review fixture',source:{domain:'pm',sourceId:'GATE-ISSUE-101'}},workflowStatus:'AWAITING_EVIDENCE',consentStatus:'NONE',authorizationStatus:'NONE',decision:{verdict:'REVIEW',riskScore:85,executionAllowed:false,requiresHumanConsent:true,policyVersion:'test',rules:[],factors:[],reviewRequirements:[{code:'REQUIRED_EVIDENCE_MISSING',resolution:'NEW_EVIDENCE'}]},evidence:{items:[],missing:['Required evidence'],links:[],bundleHash:'a'.repeat(64),complete:false,unresolvedRequirements:['REQUIRED_EVIDENCE_MISSING']},payment:null,snapshotHash:'b'.repeat(64),transactionReview:null};
 const dashboard={identity,catalog:{agents:[],projects:[],merchants:[{id:'merchant',name:'Vendor',status:'ALLOWED'}],budgets:[],policy:{}},requests:[record],events:[]};
 const service=new BackendService();
 const call=vi.spyOn(api,'call').mockImplementation(async(path:string)=>path==='/auth/me'?identity as never:path==='/dashboard'?dashboard as never:{workflowStatus:'REJECTED'} as never);
 const transaction=(await service.load()).transactions[0];
 await service.reviewTransaction(transaction,'reject','Evidence is unresolved','test-rejection');
 expect(call.mock.calls[2][0]).toBe(`/requests/${id}/reject`);
 expect(call.mock.calls[2][1]).toMatchObject({choice:'reject',reason:'Evidence is unresolved',expectedVersion:2,snapshotHash:'b'.repeat(64)});
 expect(call.mock.calls[2][2]).toBe('test-rejection:reject');
});
