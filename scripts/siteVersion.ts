// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run site:version -- <dist>`: the built site in `<dist>` made to
 * state the repository's version, its root package.json's: in the app's
 * page (`index.html`), which its scripts read it from, and in the header
 * of every page of its docs. The deploy runs it on the site CI built and
 * tested, which was built before the release wrote its version
 * (docs/deployment.md#github-pages-automatic); nothing else in the site
 * changes, its scripts least of all. It checks every page first, and
 * writes nothing when one states no version.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { withDocsVersion } from "@solid-memo/markdown/tooling/docsSite";
import { withSiteVersion } from "../apps/web/src/config.ts";
import { isReleaseVersion } from "./releaseVersion.ts";

/** What the script reads and writes. */
export type SiteVersionIo = {
  /** The repository's version, from its root package.json. */
  version(): string;
  exists(path: string): boolean;
  /** Every file under a folder, at any depth, by its path. */
  files(dir: string): string[];
  read(path: string): string;
  write(path: string, text: string): void;
  log(message: string): void;
};

/** The io of the repository at `root`. */
export function defaultIo(root: string): SiteVersionIo {
  return {
    version: () =>
      (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version,
    exists: existsSync,
    files: (dir) =>
      readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name)),
    read: (path) => readFileSync(path, "utf8"),
    write: (path, text) => writeFileSync(path, text),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 once every page states the version, 1 when one states none, 2 on a wrong call. */
export function main(argv: readonly string[], io: SiteVersionIo): number {
  // `node -e` puts the node binary first and drops the `--`.
  const args = argv.slice(1);
  if (args.length !== 1) {
    io.log("Name the built site's folder, once.\nUsage: npm run site:version -- <dist>");
    return 2;
  }
  const dist = resolve(args[0]!);
  const version = io.version();
  if (!isReleaseVersion(version)) {
    io.log(`package.json's version, ${version}, is not a version (X.Y.Z).`);
    return 1;
  }
  const page = join(dist, "index.html");
  const docs = join(dist, "docs");
  if (!io.exists(page) || !io.exists(docs)) {
    io.log(`${dist} has no index.html or docs/: build the site first (npm run build).`);
    return 1;
  }
  const pages = [page, ...io.files(docs).filter((path) => path.endsWith(".html"))];
  const stated = pages.map((path) => {
    const html = io.read(path);
    return {
      path,
      html: path === page ? withSiteVersion(html, version) : withDocsVersion(html, version),
    };
  });
  const silent = stated.filter(({ html }) => html === null).map(({ path }) => relative(dist, path));
  if (silent.length > 0) {
    io.log(`These pages state no version, so nothing was changed: ${silent.join(", ")}.`);
    return 1;
  }
  for (const { path, html } of stated) io.write(path, html!);
  io.log(`${dist}: version ${version}, in index.html and ${pages.length - 1} pages of the docs.`);
  return 0;
}

/** The script entry: `node -e "import('./scripts/siteVersion.ts').then((m) => m.run(process))" -- <dist>`. */
export function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): void {
  process.exitCode = main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
