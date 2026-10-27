// The shared screens' spreadsheet reader lazily imports SheetJS. This app does
// not ship it (and only type-checks that file through contract.ts), so declare
// the little it uses loosely rather than add the dependency.
declare module 'xlsx' {
  export function read(data: unknown, opts?: unknown): { SheetNames: string[]; Sheets: Record<string, unknown> };
  export const utils: { sheet_to_json<T>(sheet: unknown, opts?: unknown): T[] };
}
