/** Capabilities narrow roles; legacy in-process principals retain role checks. */
import type { Principal } from './contracts.js';
import { requireThat } from './errors.js';
export type ScopedPrincipal = Principal & { capabilities?: string[]; authMethod?: 'bearer' | 'session' };
export const TOOL_CAPABILITIES: Record<string,string> = {
 gate_catalog:'catalog:read', gate_search_context:'context:read', gate_get_context:'context:read',
 gate_preview_spend:'request:preview', gate_request_spend:'request:submit', gate_get_request:'request:read',
 gate_list_requests:'request:read', gate_list_investigations:'investigation:write', gate_start_investigation:'investigation:write',
 gate_submit_evidence:'investigation:write', gate_fail_investigation:'investigation:write',
};
// Preserve Chat 2's additive service names as aliases for the same narrow operations.
export function normalizeCapabilities(capabilities: string[]): string[] {
 const result=new Set(capabilities);
 for(const [canonical,alias] of [['payment:reconcile','finance:reconcile'],['development:fault','admin:fault']] as const) {
  if(result.has(canonical)||result.has(alias)){result.add(canonical);result.add(alias);}
 }
 return [...result];
}
export function capabilityAccess(principal: ScopedPrincipal, capability: string) {
 requireThat(principal.capabilities && normalizeCapabilities(principal.capabilities).includes(capability), 'FORBIDDEN', 'Credential lacks required capability.', 403);
 if (capability === 'finance:consent') requireThat(principal.role === 'FINANCE', 'FORBIDDEN', 'Independent finance identity required.', 403);
}
export function enforceHttpCapability(principal: ScopedPrincipal, method: string, route: string) {
 if (route.endsWith('/dashboard')) capabilityAccess(principal, 'catalog:read');
 const capability = route.includes('/investigation/') && method === 'POST' ? 'investigation:write' : route.endsWith('/me') ? undefined : route.endsWith('/reconcile') ? 'payment:reconcile' : route.endsWith('/fault') ? 'development:fault' : route.includes('/consent') || route.endsWith('/review') || route.endsWith('/trust-label') || /\/requests\/[^/]+\/preview$/.test(route) ? 'finance:consent'
 : route.endsWith('/cancel') ? 'request:cancel' : route.includes('/policy/preview') ? 'request:preview'
 : route.endsWith('/requests') && method === 'POST' ? 'request:submit' : route.includes('/sources') ? 'context:read'
 : route.includes('/payments') ? 'payment:read' : route.includes('/catalog') ? 'catalog:read' : 'request:read';
 if (capability) capabilityAccess(principal, capability);
}
