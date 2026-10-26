// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run lint:prose`: every page in docs/ follows the prose rules in
 * prose.json that apply to its kind, which the docs' index gives it
 * (docs/style.md#the-prose-check). `npm run lint:prose -- docs/srs.md`
 * checks the pages it names. The README, the docs' own page, is a
 * reference page.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DOCS_INDEX, type PageKind, readDocsIndex } from "@solid-memo/site/docsIndex";
import { proseProblems, readProseRules } from "@solid-memo/site/prose";

export type ProseIo = {
  /** The pages in docs/, by file name. */
  pages(): string[];
  page(name: string): string;
  index(): string;
  rules(): string;
  log(message: string): void;
};

export function defaultIo(root: string): ProseIo {
  const docs = join(root, "docs");
  return {
    pages: () => readdirSync(docs).filter((file) => file.endsWith(".md")),
    page: (name) => readFileSync(join(docs, name), "utf8"),
    index: () => readFileSync(join(root, DOCS_INDEX), "utf8"),
    rules: () => readFileSync(join(root, "prose.json"), "utf8"),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when every page checked follows the rules for its kind. */
export function main(argv: readonly string[], io: ProseIo): number {
  const { index } = readDocsIndex(io.index());
  if (index === null) {
    io.log(`${DOCS_INDEX} doesn't parse: npm run check:docs says why.`);
    return 1;
  }
  const kinds = new Map<string, PageKind>(
    index.groups.flatMap((group) => group.pages.map((page) => [page.name, page.kind] as const)),
  );
  const rules = readProseRules(io.rules());
  const named = argv.slice(1).map((path) => path.replace(/^docs\//, ""));
  const pages = named.length > 0 ? named : io.pages().sort();
  let count = 0;
  for (const name of pages) {
    const problems = proseProblems(io.page(name), kinds.get(name) ?? "reference", rules);
    for (const { line, rule, what } of problems) io.log(`docs/${name}:${line}: ${what} (${rule})`);
    count += problems.length;
  }
  if (count > 0) {
    io.log(
      `\n${count} ${count === 1 ? "problem" : "problems"}: docs/style.md#the-prose-check says what each rule asks.`,
    );
    return 1;
  }
  io.log(
    `${pages.length} ${pages.length === 1 ? "page follows" : "pages follow"} the prose rules in prose.json.`,
  );
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkProse.ts').then((m) => m.run(process))"`. */
export function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
