/**
 * @param error Anything thrown
 * @returns A one-line message for the report
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
