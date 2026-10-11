import type { DemoState, Merchant, Policy, PolicyCheck, RequestInput, Transaction } from './types';

// Original merchant artwork downloaded from official sites.
// Source URLs and hashes are recorded beside each asset and in ASSETS.json.
export const merchants: Merchant[] = [
  { id: 'github', logo: '/assets/merchants/github.svg', name: 'GitHub', category: 'Software', domain: 'github.com' },
  { id: 'delta', logo: '/assets/merchants/delta.png', name: 'Delta', category: 'Travel', domain: 'delta.com' },
  { id: 'giftcards', logo: '/assets/merchants/giftcards.svg', name: 'GiftCards.com', category: 'Retail', domain: 'giftcards.com' },
  { id: 'google', logo: '/assets/merchants/google.svg', name: 'Google Ads', category: 'Advertising', domain: 'ads.google.com' },
  { id: 'aws', logo: '/assets/merchants/aws.png', name: 'AWS', category: 'Cloud Services', domain: 'aws.amazon.com' },
  { id: 'deel', logo: '/assets/merchants/deel.png', name: 'Deel', category: 'HR / Recruiting', domain: 'deel.com' },
  { id: 'notion', logo: '/assets/merchants/notion.png', name: 'Notion', category: 'Software', domain: 'notion.so' },
  { id: 'stripe', logo: '/assets/merchants/stripe.svg', name: 'Stripe', category: 'Payments', domain: 'stripe.com' },
  { id: 'fedex', logo: '/assets/merchants/fedex.png', name: 'FedEx', category: 'Shipping', domain: 'fedex.com' },
  { id: 'linear', logo: '/assets/merchants/linear.svg', name: 'Linear', category: 'Software', domain: 'linear.app' },
];
export const departments = ['procurement', 'travel', 'marketing', 'infrastructure', 'hr', 'finance', 'operations', 'engineering'];
export const avatarUrl = (number: number) => `/assets/characters/character_${String(number).padStart(2, '0')}.png`;
export const money = (minor: number, decimals = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2, minimumFractionDigits: decimals || minor % 100 !== 0 ? 2 : 0 }).format(minor / 100);
export function ago(date: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export const dateLabel = (date: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));

export const initialPolicies: Policy[] = [
  { id: 'vendors', name: 'Approved vendor', description: 'Purchases must use an approved demo vendor.', enabled: true, value: 'github,delta,google,aws,deel,notion,stripe,fedex,linear', version: 1 },
  { id: 'budget', name: 'Within budget', description: 'Each proposed purchase must fit the demo project budget.', enabled: true, value: 380000, version: 1 },
  { id: 'limit', name: 'Autonomous approval limit', description: 'Amounts above this limit require a human review.', enabled: true, value: 200000, version: 1 },
  { id: 'purpose', name: 'Valid business purpose', description: 'Every request must include a clear business reason.', enabled: true, value: 12, version: 1 },
  { id: 'categories', name: 'Allowed purchase category', description: 'Gift card purchases are blocked in this demo.', enabled: true, value: 'Retail', version: 1 },
  { id: 'risk', name: 'Risk review threshold', description: 'Requests at or above this score require review.', enabled: true, value: 40, version: 1 },
];
export function evaluate(input: RequestInput, policies: Policy[], risk: number): PolicyCheck[] {
  const merchant = merchants.find(m => m.id === input.merchantId)!;
  return policies.map(p => {
    let passed = true, detail = '';
    switch (p.id) {
      case 'vendors': passed = String(p.value).split(',').map(v => v.trim()).includes(merchant.id); detail = `${merchant.name} is ${passed ? 'an approved' : 'not an approved'} vendor`; break;
      case 'budget': passed = input.amount <= Number(p.value); detail = `${money(input.amount)} ${passed ? '≤' : '>'} ${money(Number(p.value))} remaining`; break;
      case 'limit': passed = input.amount <= Number(p.value); detail = `${passed ? 'Below' : 'Above'} ${money(Number(p.value))} limit`; break;
      case 'purpose': passed = input.purpose.trim().length >= Number(p.value); detail = passed ? (input.project === 'Engineering expansion' ? 'Matches engineering hiring plan' : 'Business purpose documented') : 'Business purpose needs more detail'; break;
      case 'categories': passed = !String(p.value).split(',').map(v => v.trim().toLowerCase()).includes(merchant.category.toLowerCase()); detail = passed ? `${merchant.category} purchases allowed` : `${merchant.category} purchases blocked`; break;
      case 'risk': passed = risk < Number(p.value); detail = `Risk ${risk} ${passed ? '<' : '≥'} ${p.value} threshold`; break;
    }
    return { id: p.id, name: p.name, passed: !p.enabled || passed, detail: p.enabled ? detail : 'Rule disabled', version: p.version };
  });
}
export function evidenceFor(input: RequestInput, remaining: number): Transaction['evidence'] {
  const merchant = merchants.find(m => m.id === input.merchantId)!;
  return [
    { id: merchant.id, title: merchant.name, subtitle: 'Vendor record', kind: 'vendor', text: `${merchant.name} (${merchant.domain}) is a sample vendor record. Vendor eligibility is evaluated against the saved demo policy.` },
    { id: 'request', title: 'Purchase request', subtitle: 'Purchase request', kind: 'request', text: `Proposed ${money(input.amount, true)} purchase: ${input.purpose}` },
    { id: 'project', title: input.project === 'Engineering expansion' ? 'ENG-291' : input.project, subtitle: input.project === 'Engineering expansion' ? 'Engineering expansion project' : 'Business project', kind: 'project', text: `Demo project: ${input.project}. This record illustrates the business context for the proposed purchase.` },
    { id: 'budget', title: input.project === 'Engineering expansion' ? 'Budget ENG-Q4' : `${input.project} budget`, subtitle: `Remaining budget: ${money(remaining)}`, kind: 'budget', text: `Demo project allocation available at evaluation: ${money(remaining)}. This is illustrative configuration, not a live financial balance.` },
    { id: 'purpose', title: 'Business purpose', subtitle: input.purpose, kind: 'purpose', text: input.purpose },
  ];
}

export function seed(now = Date.now()): DemoState {
  const names = ['Procurement-07', 'Travel-03', 'Procurement-12', 'Marketing-02', 'Infra-01', 'HR-04', 'Procurement-09', 'Finance-01', 'Ops-02', 'Engineering-06'];
  const depts = ['procurement', 'travel', 'procurement', 'marketing', 'infrastructure', 'hr', 'procurement', 'finance', 'operations', 'engineering'];
  const descriptions = ['Sources software and equipment for new engineering hires.', 'Coordinates team travel and business bookings.', 'Reviews retail purchases and procurement requests.', 'Manages advertising campaigns and marketing spend.', 'Keeps cloud infrastructure and tooling running.', 'Supports hiring, onboarding, and people operations.', 'Maintains workspace software and team subscriptions.', 'Coordinates payments and finance operations.', 'Handles deliveries, logistics, and daily operations.', 'Equips engineering teams with development tools.'];
  const stamp = (minutes: number) => new Date(now - minutes * 60000).toISOString();
  const agents = names.map((name, i) => ({ id: `agent-${i + 1}`, name, department: depts[i], description: descriptions[i], avatar: i + 1, active: true, createdAt: stamp(14400) }));
  const amounts = [174200, 82300, 170000, 50000, 241200, 320000, 48000, 89200, 15600, 120000];
  const priorities = ['P2', 'P1', 'P0', 'P2', 'P1', 'P0', 'P2', 'P2', 'P2', 'P1'] as const;
  const decisions = ['Approved', 'Approved', 'Blocked', 'Approved', 'Pending', 'Pending', 'Approved', 'Approved', 'Approved', 'Approved'] as const;
  const risks = [8, 14, 94, 22, 46, 38, 12, 18, 6, 20];
  const ages = [10, 120, 180, 300, 360, 1440, 1500, 2880, 2940, 4320];
  const purposes = ['Purchase licenses for new engineering hires', 'Book flights for the quarterly team meeting', 'Purchase employee gift cards', 'Run the fall customer acquisition campaign', 'Scale compute capacity for the staging environment', 'Support contractor onboarding for the new team', 'Renew the product team workspace', 'Process the monthly platform payment', 'Ship equipment to a new team member', 'Renew issue tracking for the engineering team'];
  const transactions: Transaction[] = Array.from({ length: 24 }, (_, i) => {
    const first = i < 10, idx = !first && i < 21 && i % 10 === 2 ? 0 : i % 10;
    const input: RequestInput = { agentId: agents[idx].id, merchantId: merchants[idx].id, amount: first ? amounts[idx] : (120 + i * 27) * 100, priority: first ? priorities[idx] : 'P2', purpose: first ? purposes[idx] : `Renew ${merchants[idx].name} services for the ${agents[idx].department} team`, project: idx === 0 ? 'Engineering expansion' : `${depts[idx][0].toUpperCase()}${depts[idx].slice(1)} operations` };
    const decision = first ? decisions[idx] : i < 21 ? 'Approved' : i === 21 ? 'Pending' : 'Blocked';
    const risk = first ? risks[idx] : decision === 'Blocked' ? 84 : decision === 'Pending' ? 45 : 8 + i % 15;
    const checks = evaluate(input, initialPolicies, risk);
    // Historical demo approvals keep their original evaluation snapshot.
    if (decision === 'Approved') checks.forEach(c => { c.passed = true; });
    if (!first && decision === 'Blocked') { checks[0].passed = false; checks[0].detail = 'Vendor requires additional approval'; }
    const id = `REQ-${1842 - i}`;
    const evidence = evidenceFor(input, 380000);
    evidence[0].subtitle = checks[0].passed ? 'Approved vendor' : 'Vendor review required';
    evidence[1].title = id;
    return { ...input, id, risk, decision, checks, evidence, paymentMethod: 'Corporate card (Flex)', createdAt: stamp(first ? ages[idx] : 4320 + (i - 9) * 720), reason: decision === 'Blocked' ? 'Purchase did not satisfy the saved demo policies.' : undefined };
  });
  const events = transactions.map(t => ({ id: `seed-${t.id}`, type: 'request' as const, title: `${t.id} ${t.decision.toLowerCase()}`, detail: `${merchants.find(m => m.id === t.merchantId)!.name} · ${money(t.amount)} · Demo record`, createdAt: t.createdAt, actor: agents.find(a => a.id === t.agentId)!.name, transactionId: t.id, agentId: t.agentId }));
  return { version: 1, agents, transactions, policies: structuredClone(initialPolicies), events, settings: { name: 'Jordan Davis', initials: 'JD', workspace: 'Atlas Software', notifications: true, compact: false } };
}
