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
}
export type FaultMode = "SUCCESS" | "DECLINE" | "TIMEOUT_AFTER_COMMIT";
