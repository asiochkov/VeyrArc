/** Build-time variables, readable also where Vite is not running (unit tests under tsx). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const env: Record<string, any> = (import.meta as any).env ?? {};
