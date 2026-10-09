/**
 * Solid Memo itself, a folder up from the Studio on the same origin
 * (docs/studio.md), at one of its own routes (`hash`, from
 * `@solid-memo/ui/router`).
 */
export function learnerApp(hash: string): string {
  return `../${hash}`;
}
