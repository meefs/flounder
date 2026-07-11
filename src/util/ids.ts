/** Parse a public/database identifier without coercion. Strings are deliberately
 * rejected so validation, authorization, and execution cannot disagree about
 * whether an input refers to a durable row. */
export function positiveIntegerId(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
