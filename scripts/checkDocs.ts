// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:docs`: docs/docs.ttl, the docs' index, is as the docs'
 * build reads it (readDocsIndex), lists every page in docs/, and every
 * page it lists is there (docs/testing.md#documentation,
 * docs/markdown.md#the-docs-index). For a page it does not list, it
 * prints the block to add.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DOCS_INDEX,
  type DocsProblem,
  listingProblems,
  pageBlock,
  readDocsIndex,
} from "@solid-memo/markdown/tooling/docsIndex";

export type DocsIo = { pages(): string[]; index(): string; log(message: string): void };

export function defaultIo(root: string): DocsIo {
  const docs = join(root, "docs");
  return {
    pages: () => readdirSync(docs).filter((file) => file.endsWith(".md")),
    index: () => readFileSync(join(root, DOCS_INDEX), "utf8"),
    log: (message) => console.log(message),
  };
}

/** What is wrong with the index, as lines to print; none when the check passes. */
export function docsIndexProblems(pages: readonly string[], text: string): string[] {
  const { index, problems } = readDocsIndex(text);
  const where = ({ file, line, what }: DocsProblem) =>
    `${file}${line === null ? "" : `:${line}`}: ${what}`;
  if (index === null) return problems.map(where);
  return [
    ...problems.map(where),
    ...listingProblems(index, pages).map((problem) =>
      problem.file === DOCS_INDEX
        ? where(problem)
        : `${where(problem)}; add it to a group there, for example:\n\n${pageBlock(index, problem.file.slice("docs/".length))}\n`,
    ),
  ];
}

/** Exit code: 0 when the index and the pages agree. */
export function main(io: DocsIo): number {
  const problems = docsIndexProblems(io.pages(), io.index());
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(`${DOCS_INDEX} lists every page in docs/.`);
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkDocs.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
