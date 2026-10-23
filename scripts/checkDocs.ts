// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:docs`: docs/docs.ttl, the docs' index, is as the docs'
 * build reads it (readDocsIndex), lists every page in docs/, and every
 * page it lists is there (docs/testing.md#documentation,
 * docs/markdown.md#the-docs-index). For a page it does not list, it
 * prints the block to add. And every `npm run <script>` in the
 * repository's Markdown names a script of the root package.json, or of
 * the workspace it names with `-w`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  DOCS_INDEX,
  type DocsProblem,
  listingProblems,
  pageBlock,
  readDocsIndex,
} from "@solid-memo/site/docsIndex";

/** The scripts of the root package (`root`) and of each workspace, by its name. */
export type Scripts = { root: string[]; workspaces: Record<string, string[]> };

export type DocsIo = {
  pages(): string[];
  index(): string;
  /** The repository's Markdown, by its path. */
  markdown(): Map<string, string>;
  scripts(): Scripts;
  log(message: string): void;
};

type Manifest = { name: string; scripts: Record<string, string>; workspaces: string[] };

export function defaultIo(root: string): DocsIo {
  const docs = join(root, "docs");
  const manifest = (dir: string): Manifest =>
    JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  return {
    pages: () => readdirSync(docs).filter((file) => file.endsWith(".md")),
    index: () => readFileSync(join(root, DOCS_INDEX), "utf8"),
    // Tracked or new, and still there: a file deleted but not yet staged is gone.
    markdown: () =>
      new Map(
        execFileSync(
          "git",
          [
            "-C",
            root,
            "ls-files",
            "-z",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            "*.md",
          ],
          { encoding: "utf8" },
        )
          .split("\0")
          .filter((path) => path !== "" && existsSync(join(root, path)))
          .map((path) => [path, readFileSync(join(root, path), "utf8")]),
      ),
    scripts: () => {
      const top = manifest(root);
      // The workspaces are `<group>/*` globs (package.json).
      const workspaces = top.workspaces.flatMap((glob) => {
        const group = join(root, glob.slice(0, -"/*".length));
        return readdirSync(group)
          .filter((folder) => existsSync(join(group, folder, "package.json")))
          .map((folder) => manifest(join(group, folder)));
      });
      return {
        root: Object.keys(top.scripts),
        workspaces: Object.fromEntries(
          workspaces.map((workspace) => [workspace.name, Object.keys(workspace.scripts)]),
        ),
      };
    },
    log: (message) => console.log(message),
  };
}

// `npm run <script>`, then `-w <workspace>` or `--workspace=<workspace>`
// if it names one; a script named by a placeholder (`<script>`) is none.
const NPM_RUN = /npm run\s+([a-z][\w:.-]*)(?:\s+(?:-w|--workspace)(?:\s+|=)([@\w/.-]+))?/g;

/**
 * Each `npm run` in the Markdown that names a script the package it runs
 * in does not have, as lines to print. CHANGELOG.md is left out: it
 * records each release as it was, scripts since renamed included.
 */
export function scriptProblems(markdown: ReadonlyMap<string, string>, scripts: Scripts): string[] {
  return [...markdown]
    .filter(([file]) => file !== "CHANGELOG.md")
    .flatMap(([file, text]) =>
      [...text.matchAll(NPM_RUN)].flatMap(({ 1: script, 2: workspace, index }) => {
        const where = `${file}:${text.slice(0, index).split("\n").length}`;
        if (workspace === undefined)
          return scripts.root.includes(script)
            ? []
            : [`${where}: npm run ${script}: the root package.json has no such script`];
        const own = scripts.workspaces[workspace];
        if (own === undefined)
          return [`${where}: npm run ${script} -w ${workspace}: no such workspace`];
        return own.includes(script)
          ? []
          : [`${where}: npm run ${script} -w ${workspace}: the workspace has no such script`];
      }),
    );
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

/** Exit code: 0 when the index and the pages agree, and every script named is there. */
export function main(io: DocsIo): number {
  const problems = [
    ...docsIndexProblems(io.pages(), io.index()),
    ...scriptProblems(io.markdown(), io.scripts()),
  ];
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(
    `${DOCS_INDEX} lists every page in docs/, and every npm run in the Markdown names a script.`,
  );
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkDocs.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
