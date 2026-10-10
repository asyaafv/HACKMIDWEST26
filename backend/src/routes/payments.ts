/** Financial routes are exported for shared app registration under /v1. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Principal } from "../contracts.js";
import { idSchema, keySchema } from "../contracts.js";
import type { GateService } from "../service.js";

export function registerPaymentRoutes(app: FastifyInstance, dependencies: {
  service: GateService;
  principal: (request: any) => Promise<Principal>;
  development: boolean;
}) {
  const { service, principal, development } = dependencies;
  const paymentId = (request: any) => idSchema.parse(request.params.id);
  const key = (request: any) => keySchema.parse(request.headers["idempotency-key"]);
  const wrap = (data: unknown, traceId: string) => ({ data, meta: { traceId, mode: "sandbox", provider: "simulator" } });
  app.get("/payments/:id", async request => wrap(await service.paymentDetail(await principal(request), paymentId(request)), request.id));
  app.post("/payments/:id/reconcile", async request =>
    wrap(await service.reconcilePayment(await principal(request), paymentId(request), key(request)), request.id));
  app.post("/payments/:id/fault", async request => {
    const body = z.object({ mode: z.enum(["SUCCESS", "DECLINE", "TIMEOUT_BEFORE_COMMIT", "TIMEOUT_AFTER_COMMIT"]) }).strict().parse(request.body);
    return wrap(await service.setPaymentFault(await principal(request), paymentId(request), body.mode, key(request), development), request.id);
  });
}
