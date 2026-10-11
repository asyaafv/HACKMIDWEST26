/** Mock transport contracts; these tests are not live DevRev execution evidence. */
import {afterEach,it,expect,vi} from 'vitest';
import {api,BackendService} from '../../src/backend-service';
import {startCoordinatorReview,latestCoordinatorRun} from '../../src/orchestration-api';
const requestId='9de772b5-4c6f-41b1-9510-46eb74ac28b9';
const identity={id:'operator',orgId:'fixture-org',role:'OPERATOR',capabilities:['request:read','catalog:read']};
const dashboard={identity:{...identity,role:'FINANCE'},catalog:{agents:[],projects:[],merchants:[],budgets:[],policy:{}},requests:[],events:[]};
afterEach(()=>{api.clear();vi.unstubAllGlobals();});
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
 await expect(new BackendService().load()).rejects.toThrow('DEPENDENCY_FAILURE');expect(fetcher).toHaveBeenCalledTimes(1);
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
