// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * What a release commit may change (docs/releasing.md#the-deploy-key):
 * release.yml's prepare job runs semantic-release with no key, and its
 * push job, which holds the key, pushes the commit only when these
 * checks find nothing but what a release writes. Each of the five files
 * must be the file on main's tip with the version written in:
 *
 * - package.json: the version;
 * - package-lock.json: the version, and the root package's version;
 * - publiccode.yml and CITATION.cff: the version and the date, as
 *   `npm run release:version` writes them (scripts/releaseVersion.ts);
 * - CHANGELOG.md: one new entry, headed by the version and that date,
 *   between the header and the entries before it, as
 *   @semantic-release/changelog writes it.
 *
 * Whatever made the commit, it can then change no dependency, no script
 * and no other text: only the changelog entry's notes, which the
 * release's commits wrote.
 */
import { setKeys, TARGETS } from "./releaseVersion.ts";

const { assets, changelogTitle } = (await import(
  new URL("../release.config.mjs", import.meta.url).href
)) as { assets: string[]; changelogTitle: string };

/** A file as main's tip has it, and as the release commit has it. */
export interface Change {
  path: string;
  before: string;
  after: string;
}

/** What comes before the entries in CHANGELOG.md, as the changelog plugin writes it. */
const HEAD = `${changelogTitle}\n\n`;

/**
 * The entry a release added to CHANGELOG.md, which is the release's
 * notes: what `after` holds between the header and the entries `before`
 * had, as @semantic-release/changelog writes it (the notes, a blank
 * line, the entries). Undefined when `after` is anything else.
 */
export function addedEntry(before: string, after: string): string | undefined {
  if (!before.startsWith(HEAD) || !after.startsWith(HEAD)) return undefined;
  const rest = `\n\n${before.slice(HEAD.length)}`;
  if (!after.endsWith(rest)) return undefined;
  const entry = after.slice(HEAD.length, after.length - rest.length);
  if (entry === "" || entry !== entry.trim()) return undefined;
  return entry;
}

/** The date of the entry, from its heading, when it heads the version. */
function entryDate(entry: string, version: string): string | undefined {
  const heading = entry.split("\n", 1)[0]!;
  const v = version.replaceAll(".", "\\.");
  const match = new RegExp(
    `^## \\[${v}\\]\\(https://github\\.com/[\\w.-]+/[\\w.-]+/compare/v\\d+\\.\\d+\\.\\d+\\.\\.\\.v${v}\\) \\((\\d{4}-\\d{2}-\\d{2})\\)$`,
  ).exec(heading);
  return match?.[1];
}

/** package.json's version, or package-lock.json's, set to `version`. */
function withVersion(path: string, text: string, version: string): string | undefined {
  const top = /^( {2}"version": )"[^"\n]*"/m;
  if (!top.test(text)) return undefined;
  const result = text.replace(top, `$1"${version}"`);
  if (path === "package.json") return result;
  // The root package's entry, the first under "packages".
  const root = /^( {4}"": \{\n(?: {6}.*\n)*? {6}"version": )"[^"\n]*"/m;
  if (!root.test(result)) return undefined;
  return result.replace(root, `$1"${version}"`);
}

/** What `before` becomes in a release of `version` on `date`, or undefined if it cannot. */
function released(path: string, before: string, version: string, date: string): string | undefined {
  if (path === "package.json" || path === "package-lock.json") {
    return withVersion(path, before, version);
  }
  // One of releaseVersion.ts's files; a file added to the release's
  // assets with no check of its own throws here too, and is refused.
  try {
    const target = TARGETS.find((each) => each.path === path)!;
    return setKeys(before, target.after, target.keys(version, date));
  } catch {
    return undefined;
  }
}

/**
 * Why the changes are not what a release of `version` writes: one
 * reason a file, or none when they are. `changes` holds every file the
 * commit changes, each with its text before and after.
 */
export function unexpectedChanges(changes: readonly Change[], version: string): string[] {
  const byPath = new Map(changes.map((change) => [change.path, change]));
  const problems: string[] = [];
  for (const change of changes) {
    if (!assets.includes(change.path)) problems.push(`${change.path}: a release never writes it`);
  }
  for (const path of assets) {
    if (!byPath.has(path)) problems.push(`${path}: unchanged`);
  }
  const changelog = byPath.get("CHANGELOG.md");
  if (changelog === undefined) return problems;
  const entry = addedEntry(changelog.before, changelog.after);
  if (entry === undefined) {
    problems.push("CHANGELOG.md: not one new entry under its header");
    return problems;
  }
  const date = entryDate(entry, version);
  if (date === undefined) {
    problems.push(`CHANGELOG.md: its new entry is not headed ${version} and a date`);
    return problems;
  }
  for (const change of changes) {
    if (change.path === "CHANGELOG.md" || !assets.includes(change.path)) continue;
    if (released(change.path, change.before, version, date) !== change.after) {
      problems.push(`${change.path}: changes more than the version and the date`);
    }
  }
  return problems;
}
