/** Canonical JSON hashing makes request bindings and audit chains order-independent. */
import { createHash } from "node:crypto";

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).filter(k => object[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(object[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export const hash = (value: unknown): string => createHash("sha256").update(canonical(value)).digest("hex");
export const secretHash = (secret: string): string => createHash("sha256").update(secret).digest("hex");
