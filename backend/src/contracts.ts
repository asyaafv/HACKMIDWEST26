/** Shared API/MCP validation. USD cents travel as strings to preserve exact integers. */
import { z } from "zod";

export const moneySchema = z.string().regex(/^[1-9][0-9]{0,11}$/).refine(v => /^[1-9][0-9]{0,11}$/.test(v) && BigInt(v) <= 99_999_999n, "Amount exceeds sandbox maximum");
export const keySchema = z.string().regex(/^[A-Za-z0-9:_-]{8,128}$/);
export const idSchema = z.string().uuid();
export const proposalSchema = z.object({
  agentId: idSchema,
  projectId: idSchema,
  merchantId: idSchema,
  amountMinor: moneySchema,
  currency: z.literal("USD"),
  category: z.enum(["incident_response", "diagnostics"]),
  purpose: z.string().trim().min(1).max(1000),
  source: z.object({ domain: z.enum(["pm", "crm", "document"]), sourceId: z.string().min(1).max(200) }).strict(),
}).strict();
export type Proposal = z.infer<typeof proposalSchema>;
export const consentSchema = z.object({
  choice: z.enum(["approve", "reject"]),
  previewId: idSchema,
  previewHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  reviewResolutions: z.array(z.string().max(80)).max(10).default([]),
}).strict();
export type Consent = z.infer<typeof consentSchema>;
export interface Principal {
  id: string;
  orgId: string;
  credentialId: string;
  role: "OPERATOR" | "AGENT" | "FINANCE" | "AUDITOR" | "ADMIN";
  approvalLimitMinor: string;
  capabilities?: string[];
  authMethod?: "bearer" | "session";
}
export type FaultMode = "SUCCESS" | "DECLINE" | "TIMEOUT_AFTER_COMMIT";

/** Additive v1 output shapes: nested domain records remain extensible. */
export const workflowStatusSchema = z.enum(['COLLECTING','AWAITING_EVIDENCE','AWAITING_CONSENT','REJECTED','AUTHORIZED','EXECUTING','RECONCILING','COMPLETED','FAILED','CANCELLED','EXPIRED']);
export const riskAssessmentSchema = z.object({ computedBy: z.literal('BACKEND_POLICY'), modelVersion: z.string(),
  scoreType: z.literal('RULE_POINTS'), score: z.number().int().min(0).max(100), maximum: z.number().int().positive(),
  reviewThreshold: z.number().int(), level: z.enum(['LOW','REVIEW_REQUIRED','BLOCKED']), lowRisk: z.boolean(), summary: z.string() });
export const decisionSchema = z.looseObject({ verdict: z.enum(['APPROVE','REVIEW','REJECT']), riskScore: z.number().int().min(0).max(100), riskAssessment: riskAssessmentSchema.optional(), executionAllowed: z.boolean(), requiresHumanConsent: z.boolean(), reviewRequirements: z.array(z.looseObject({ code: z.string(), resolution: z.string() })) });
export const evidenceSchema = z.looseObject({ complete: z.boolean(), items: z.array(z.looseObject({ id: idSchema, domain: z.string(), sourceId: z.string() })), links: z.array(z.record(z.string(), z.unknown())), missing: z.array(z.string()), bundleHash: z.string() });
export const requestResponseSchema = z.looseObject({ id: idSchema, version: z.number().int(), proposal: proposalSchema, workflowStatus: workflowStatusSchema, permittedActions: z.array(z.enum(['PREVIEW_CONSENT','CANCEL','RECONCILE'])).optional(), decision: decisionSchema, evidence: evidenceSchema, payment: z.looseObject({ id: idSchema, status: z.enum(['QUEUED','PROCESSING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED']), holdState: z.enum(['HELD','CAPTURED','RELEASED']), amountMinor: moneySchema, receipt: z.unknown().nullable() }).nullable(), mode: z.literal('sandbox'), provider: z.literal('simulator') });
export const previewResponseSchema = z.looseObject({ id: idSchema, requestId: idSchema, previewHash: z.string(), expectedVersion: z.number().int(), expiresAt: z.string(), proposal: proposalSchema, destinationRef: z.string(), decision: decisionSchema, evidenceHash: z.string(), policyHash: z.string(), mode: z.literal('sandbox'), provider: z.literal('simulator') });
export const paymentResponseSchema = z.looseObject({ requestId: idSchema, paymentId: idSchema, workflowStatus: workflowStatusSchema, policyVerdict: z.enum(['APPROVE','REVIEW','REJECT']), consentStatus: z.literal('GRANTED'), authorizationStatus: z.enum(['READY','DISPATCHED','CONSUMED','REVOKED','EXPIRED','UNKNOWN']), paymentStatus: z.enum(['QUEUED','PROCESSING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED']), holdState: z.enum(['HELD','CAPTURED','RELEASED']), amountMinor: moneySchema, operationKey: z.string(), receipt: z.unknown().nullable(), attempts: z.array(z.record(z.string(),z.unknown())), events: z.array(z.record(z.string(),z.unknown())), job: z.record(z.string(),z.unknown()).optional() });
export const apiSchemas = Object.fromEntries(Object.entries({ Proposal: proposalSchema, Consent: consentSchema, Payment: paymentResponseSchema, Request: requestResponseSchema, Preview: previewResponseSchema, Principal: z.looseObject({ id: idSchema, orgId: idSchema, role: z.enum(['OPERATOR','AGENT','FINANCE','AUDITOR','ADMIN']), approvalLimitMinor: z.string(), capabilities: z.array(z.string()).optional(), authMethod: z.enum(['bearer','session']).optional() }) }).map(([name, schema]) => [name, z.toJSONSchema(schema, { unrepresentable: 'any' })]));
