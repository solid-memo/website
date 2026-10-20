// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:closes -- --base <git ref> [--head <git ref>] [--body-file <path>]`:
 * a pull request closes the issue it addresses
 * (CONTRIBUTING.md#commit-messages). GitHub closes an issue on merge
 * only for a closing keyword (`Closes`, `Fixes` or `Resolves`, a colon
 * allowed, then `#NN`, `owner/repo#NN` or the issue's address) in the
 * pull request's body or in a commit that lands on main; `Refs: #NN`
 * links it and nothing more, so the issue would stay open.
 *
 * The check passes when the body or a commit since the base has one. A
 * pull request that is one step of its issue, and does not finish it,
 * passes with `Refs: #NN` in its body when it checks the template's
 * "One step" box. A security fix, made in private (SECURITY.md), has no
 * public issue to close: it passes when a commit names its advisory
 * (`GHSA-xxxx-xxxx-xxxx`), as commitlint.config.mjs lets it. Text in an HTML comment or in code does not count in
 * the body, as GitHub links no issue there; the template's own hints are
 * in a comment.
 *
 * The commits are those from where `--head` (HEAD by default) left the
 * base to `--head`. CI names the pull request's head, as the checkout is
 * the pull request merged into the base, whose commits since the event's
 * base may include some of main's.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** A commit since the base: its hash, and its whole message. */
export type Commit = { hash: string; message: string };

/** The keywords GitHub closes an issue for, as its docs list them, with a colon or without. */
const CLOSES =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?[ \t]+(?:[\w.-]+\/[\w.-]+)?(?:#|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/)\d+\b/i;
const REFS = /\bRefs:?[ \t]+#\d+\b/i;
const ONE_STEP = /^\s*[-*] \[[xX]\] \*\*One step\.\*\*/m;
/** A GitHub security advisory's id, as commitlint.config.mjs takes it. */
const ADVISORY = /\bGHSA(?:-[23456789cfghjmpqrvwx]{4}){3}\b/;

/**
 * The text GitHub links issues in: HTML comments, the template's hints
 * among them, fenced code blocks and code spans left out.
 */
export function prose(markdown: string): string {
  return markdown
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(
      /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[ \t]*(?:\n|$(?![\s\S]))|(?![\s\S]))/gm,
      "",
    )
    .replace(/(`+)[\s\S]*?[^`]\1(?!`)/g, "");
}

/** Whether a text names an issue with a closing keyword. */
export function closesAnIssue(text: string): boolean {
  return CLOSES.test(text);
}

/** Whether a body says its pull request is one step of its issue, and names it. */
export function isOneStep(body: string): boolean {
  return ONE_STEP.test(body) && REFS.test(body);
}

/** What the check found: a problem fails it, a note does not. */
export function verdict(
  body: string | undefined,
  commits: readonly Commit[],
): { problem?: string; note: string } {
  const text = body === undefined ? undefined : prose(body);
  if (text !== undefined && closesAnIssue(text)) {
    return { note: "The pull request's body closes its issue." };
  }
  const closing = commits.find((commit) => closesAnIssue(commit.message));
  if (closing) {
    return {
      note: `${closing.hash.slice(0, 8)} ${closing.message.split("\n")[0]} closes its issue.`,
    };
  }
  if (text !== undefined && isOneStep(text)) {
    return { note: "The pull request is one step of its issue, which stays open (Refs:)." };
  }
  const fix = commits.find((commit) => ADVISORY.test(commit.message));
  if (fix) {
    return {
      note: `${fix.hash.slice(0, 8)} ${fix.message.split("\n")[0]} names its security advisory, which closes no issue.`,
    };
  }
  return {
    problem: `Neither ${body === undefined ? "" : "the pull request's body nor "}any commit closes an issue. Name the issue the pull request finishes with \`Closes: #NN\` (or \`Fixes:\`, \`Resolves:\`) in its body; \`Refs: #NN\` does not close it. If the pull request is one step of its issue and does not finish it, write \`Refs: #NN\` and check the template's "One step" box (CONTRIBUTING.md#commit-messages). Then run the check again.`,
    note: "",
  };
}

/** What the check reads. */
export interface ClosesIo {
  /** The merge base of `ref` and `head`. */
  mergeBase(ref: string, head: string): string;
  /** The commits from `commit` to `head`, merges aside. */
  commitsSince(commit: string, head: string): Commit[];
  readFile(path: string): string;
  log(message: string): void;
}

const USAGE =
  "Usage: npm run check:closes -- --base <git ref> [--head <git ref>] [--body-file <path>]";

/** The options, or undefined when they are not the ones USAGE gives. */
export function parseArgs(
  args: readonly string[],
): { base: string; head: string; bodyFile?: string } | undefined {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const [name, value] = [args[i], args[i + 1]];
    if (!["--base", "--head", "--body-file"].includes(name) || options.has(name)) return undefined;
    if (value === undefined || value.startsWith("-")) return undefined;
    options.set(name, value);
  }
  const base = options.get("--base");
  if (base === undefined) return undefined;
  return { base, head: options.get("--head") ?? "HEAD", bodyFile: options.get("--body-file") };
}

/** Exit code: 0 when the pull request closes an issue, or says it is one step of one. */
export function main(argv: readonly string[], io: ClosesIo): number {
  // `node -e` puts the node binary first and drops the `--`.
  const options = parseArgs(argv.slice(1));
  if (options === undefined) {
    io.log(USAGE);
    return 1;
  }
  try {
    const body = options.bodyFile === undefined ? undefined : io.readFile(options.bodyFile);
    const { base, head } = options;
    const { problem, note } = verdict(body, io.commitsSince(io.mergeBase(base, head), head));
    io.log(problem ?? note);
    return problem === undefined ? 0 : 1;
  } catch (error) {
    io.log((error as Error).message);
    return 1;
  }
}

/** The io of the repository at `repo`. */
export function defaultIo(repo: string): ClosesIo {
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  return {
    mergeBase: (ref, head) => git("merge-base", "--end-of-options", ref, head).trim(),
    commitsSince: (commit, head) =>
      git("log", "--no-merges", "--format=%H%x1f%B%x1e", "--end-of-options", `${commit}..${head}`)
        .split("\x1e")
        .map((entry) => entry.trim())
        .filter((entry) => entry !== "")
        .map((entry) => {
          const [hash, message] = entry.split("\x1f");
          return { hash, message: message.trim() };
        }),
    readFile: (path) => readFileSync(path, "utf8"),
    log: (message) => console.log(message),
  };
}

/** The script entry: `node -e "import('./scripts/checkClosesIssue.ts').then((m) => m.run(process))" -- --base <ref>`. */
export function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
