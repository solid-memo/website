/**
 * `npm run check:docs`: docs/README.md, the docs' index, lists every page
 * in docs/, and every page it lists is there (docs/testing.md#documentation).
 * A page counts as listed when the index links to it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The pages the index links to: relative links to a Markdown file beside it. */
export function listedPages(index: string): Set<string> {
  const pages = new Set<string>();
  for (const [, target] of index.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)\s]*)?\)/g)) {
    if (!target.includes("/")) pages.add(target);
  }
  return pages;
}

/** What is wrong with the index; none when the check passes. */
export function docsIndexProblems(pages: readonly string[], index: string): string[] {
  const listed = listedPages(index);
  const present = new Set(pages);
  return [
    ...pages
      .filter((page) => page !== "README.md" && !listed.has(page))
      .map((page) => `docs/${page}: not listed in docs/README.md; add a line for it there.`),
    ...[...listed]
      .filter((page) => !present.has(page))
      .map((page) => `docs/README.md lists ${page}, which is not in docs/.`),
  ];
}

export type DocsIo = { pages(): string[]; index(): string; log(message: string): void };

export function defaultIo(root: string): DocsIo {
  const docs = join(root, "docs");
  return {
    pages: () => readdirSync(docs).filter((file) => file.endsWith(".md")),
    index: () => readFileSync(join(docs, "README.md"), "utf8"),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when the index and the pages agree. */
export function main(io: DocsIo): number {
  const problems = docsIndexProblems(io.pages(), io.index());
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log("docs/README.md lists every page in docs/.");
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkDocs.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
