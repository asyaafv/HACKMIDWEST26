/** Domain failures carry safe codes; transport layers never expose SQL or secrets. */
export class GateError extends Error {
  constructor(public code: string, message: string, public status = 422) {
    super(message);
  }
}

export function requireThat(condition: unknown, code: string, message: string, status = 422): asserts condition {
  if (!condition) throw new GateError(code, message, status);
}
