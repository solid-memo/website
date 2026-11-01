// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run dependencies:summary -- <changes.json>`: the packages a pull
 * request adds, changes and removes, as a Markdown table per manifest
 * (docs/testing.md#dependency-review). CI's dependency-review job adds it
 * to its run's summary ($GITHUB_STEP_SUMMARY); without that variable it
 * is printed. The file is GitHub's comparison of the dependency graph of
 * the pull request's base and head
 * (`gh api --paginate --slurp repos/<repo>/dependency-graph/compare/<base>...<head>`),
 * the same one dependency-review-action judges: its pages, each a list
 * of changes, or the list itself. A version that goes and another of the
 * same package that comes, in one manifest, are one change. It only
 * reports: the action fails the job.
 */
import { appendFileSync, readFileSync } from "node:fs";

/** One change of GitHub's comparison, as much of it as the table shows. */
export type Change = {
  change_type: "added" | "removed";
  manifest: string;
  ecosystem: string;
  name: string;
  version: string;
  license: string | null;
  scope?: string;
};

/** One row: a package of one manifest, its versions before and after. */
type Row = {
  ecosystem: string;
  name: string;
  removed: string[];
  added: string[];
  license: string | null;
  scope: string | undefined;
};

/** The changes of every page, in the order GitHub gave them. */
export function changes(json: string): Change[] {
  return (JSON.parse(json) as (Change | Change[])[]).flat();
}

function rows(changes: readonly Change[]): Map<string, Row[]> {
  const byManifest = new Map<string, Map<string, Row>>();
  for (const change of changes) {
    const manifest = byManifest.get(change.manifest) ?? new Map<string, Row>();
    byManifest.set(change.manifest, manifest);
    const key = `${change.ecosystem}\u0000${change.name}`;
    const row = manifest.get(key) ?? {
      ecosystem: change.ecosystem,
      name: change.name,
      removed: [],
      added: [],
      license: null,
      scope: undefined,
    };
    manifest.set(key, row);
    row[change.change_type].push(change.version);
    // What the package is now: the added version's, or the removed one's.
    if (change.change_type === "added" || row.added.length === 0) {
      row.license = change.license;
      row.scope = change.scope;
    }
  }
  return new Map(
    [...byManifest]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([manifest, byName]) => [
        manifest,
        [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
      ]),
  );
}

function what({ removed, added }: Row): string {
  if (removed.length === 0) return `added ${added.join(", ")}`;
  if (added.length === 0) return `removed ${removed.join(", ")}`;
  return `${removed.join(", ")} → ${added.join(", ")}`;
}

/** The tables, or a line saying nothing changed. */
export function render(changes: readonly Change[]): string {
  const byManifest = rows(changes);
  if (byManifest.size === 0) {
    return "## Dependency changes\n\nNo package was added, changed or removed.\n";
  }
  const all = [...byManifest.values()].flat();
  const count = (kind: (row: Row) => boolean) => all.filter(kind).length;
  const lines = [
    "## Dependency changes",
    "",
    `${count((row) => row.removed.length === 0)} added, ${count((row) => row.removed.length > 0 && row.added.length > 0)} changed, ${count((row) => row.added.length === 0)} removed.`,
  ];
  for (const [manifest, manifestRows] of byManifest) {
    lines.push(
      "",
      `### \`${manifest}\``,
      "",
      "| Package | Ecosystem | Version | Scope | License |",
      "|---|---|---|---|---|",
      ...manifestRows.map(
        (row) =>
          `| \`${row.name}\` | ${row.ecosystem} | ${what(row)} | ${row.scope ?? "–"} | ${row.license ?? "–"} |`,
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** The script entry: `node -e "import('./scripts/dependencyChanges.ts').then((m) => m.run(process))" -- <changes.json>`. */
export function run(process: {
  argv: readonly string[];
  env: Record<string, string | undefined>;
}): void {
  const path = process.argv[1];
  if (path === undefined) throw new Error("Usage: npm run dependencies:summary -- <changes.json>");
  const text = render(changes(readFileSync(path, "utf8")));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else console.log(text);
}
