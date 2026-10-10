/** Provider calls run outside the financial transaction; recovery capability is explicit. */
export type ProviderStatus = "SUCCEEDED" | "FAILED";
export interface PaymentOperation {
  orgId: string; paymentId: string; operationKey: string; requestId: string;
  amountMinor: string; destinationRef: string; boundHash: string;
  faultMode: "SUCCESS" | "DECLINE" | "TIMEOUT_BEFORE_COMMIT" | "TIMEOUT_AFTER_COMMIT";
}
export interface ProviderReceipt {
  providerObjectId: string; paymentId: string; amountMinor: string; currency: "USD";
  destinationRef: string; provider: "simulator"; mode: "sandbox";
  label: "SIMULATED — NO MONEY MOVED"; status: ProviderStatus; createdAt: string;
}
export interface PaymentProvider {
  readonly name: "simulator";
  capabilities(): { retrieveById: boolean; recoverByKey: boolean; cancel: boolean };
  execute(operation: PaymentOperation): Promise<ProviderReceipt>;
  retrieve(operation: PaymentOperation): Promise<ProviderReceipt | null>;
}
