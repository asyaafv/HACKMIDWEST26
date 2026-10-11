/** Gatekeeper handoff accepts citations to verified imported records, never model-authored financial authority. */
import { z } from 'zod';
import { idSchema } from './contracts.js';
export const startInvestigationSchema = z.object({expectedVersion:z.number().int().positive()}).strict();
export const evidenceReportSchema = z.object({
 sources:z.array(z.object({domain:z.enum(['pm','crm','document']),sourceId:z.string().min(1).max(200),
  sourceHash:z.string().regex(/^[a-f0-9]{64}$/),contentHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(20),
 links:z.array(z.object({fromId:idSchema,toId:idSchema,basisPointer:z.string().max(500),
  relationship:z.enum(['ISSUE_TICKET','TICKET_ACCOUNT','DOCUMENT_TICKET','EXPLICIT_REFERENCE'])}).strict()).max(100),
 unresolvedQuestions:z.array(z.string().trim().min(1).max(500)).max(10).default([]),
}).strict();
export const submitEvidenceSchema = startInvestigationSchema.extend({runId:idSchema,report:evidenceReportSchema});
export const failInvestigationSchema = startInvestigationSchema.extend({runId:idSchema,reason:z.string().trim().min(1).max(1000)});
