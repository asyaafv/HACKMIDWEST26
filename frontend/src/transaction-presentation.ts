import type { Transaction } from './types';

export function transactionStatusLabel(transaction: Transaction) {
  const payment=transaction.historicalPayment;
  if(payment?.status==='SUCCEEDED'&&payment.holdState==='CAPTURED')return 'Paid';
  if(payment?.status==='PROCESSING')return 'Payment processing';
  if(payment?.status==='QUEUED')return 'Payment queued';
  if(payment?.status==='FAILED')return 'Payment failed';
  if(payment?.status==='CANCELLED')return 'Payment cancelled';
  switch(transaction.workflowStatus){
    case 'AWAITING_EVIDENCE':return 'Evidence needed';
    case 'AWAITING_CONSENT':return 'Finance review';
    case 'AUTHORIZED':return transaction.authorizationStatus==='REVIEWED'?'Approved':'Authorized';
    case 'EXECUTING':case 'RECONCILING':return 'Payment processing';
    case 'COMPLETED':return 'Paid';
    case 'REJECTED':return 'Rejected';
    case 'FAILED':return 'Payment failed';
    case 'CANCELLED':return 'Cancelled';
    case 'EXPIRED':return 'Expired';
    default:return transaction.decision==='Pending'?'Needs review':transaction.decision==='Blocked'?'Rejected':'Approved';
  }
}

export function hasCompletedPurchase(transaction: Transaction) {
  return transaction.historicalPayment?.status==='SUCCEEDED'&&transaction.historicalPayment.holdState==='CAPTURED';
}
