import {afterEach,expect,it,vi} from 'vitest';
import {api,BackendService} from '../../src/backend-service';
afterEach(()=>vi.restoreAllMocks());
it.each(['AWAITING_CONSENT','AWAITING_EVIDENCE'])('maps %s without hiding finance review behind an old investigation',async status=>{
 vi.spyOn(api,'call').mockResolvedValue({
  identity:{id:'finance',orgId:'org',role:'FINANCE',capabilities:['finance:consent']},events:[],
  catalog:{agents:[{id:'agent',name:'Agent',active:true,project_id:'project',owner_id:'owner',cap_minor:'500000'}],projects:[{id:'project',name:'Project'}],merchants:[{id:'merchant',name:'Merchant',status:'ALLOWED'}],budgets:[],policy:{}},
  requests:[{id:'request',version:1,createdAt:'2026-10-11T05:00:00Z',proposal:{agentId:'agent',projectId:'project',merchantId:'merchant',amountMinor:'100010',purpose:'Synthetic review'},workflowStatus:status,authorizationStatus:'NONE',snapshotHash:'a'.repeat(64),payment:null,transactionReview:null,
   investigation:{status:'WAITING'},decision:{verdict:'REVIEW',riskScore:20,rules:[],factors:[],reviewRequirements:[],policyVersion:'test'},evidence:{items:[],links:[],missing:[],complete:status==='AWAITING_CONSENT',unresolvedRequirements:status==='AWAITING_EVIDENCE'?['CONTRADICTORY_FACT:test']:[]}}],
 });
 const transaction=(await new BackendService().load()).transactions[0];
 expect(transaction.decision).toBe('Pending');
 expect(transaction.canApprove).toBe(status==='AWAITING_CONSENT');
 if(status==='AWAITING_EVIDENCE'){
  expect(transaction.approvalBlockReason).toContain('you can deny');
  expect(transaction.unresolvedQuestions).toEqual(['CONTRADICTORY_FACT:test']);
 }
});
