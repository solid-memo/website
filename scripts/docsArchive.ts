// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run docs:archive -- <version>`: renders the docs as that release
 * publishes them on its GitHub release
 * (docs/deployment.md#a-releases-docs-as-an-archive), with their links
 * into the repository at the release's tag, and packs them into one file,
 * `release-assets/docs-<version>.tar.gz`. The archive holds the pages,
 * their stylesheet and their drawings, with the font's license beside
 * them, all under `docs/`.
 *
 * It draws every diagram, whatever DOCS_DIAGRAMS says: an archive is
 * rendered once and never again, so one without its drawings is never
 * written. Each drawing is checked as the site's build checks it before
 * the archive is packed, with the system's `tar`.
 *
 * `npm run docs:archive -- --draw` draws and checks the diagrams as an
 * archive would hold them, keeping them in the drawings' cache, and
 * writes no archive: release.yml's prepare job draws them so, with no
 * secret, before semantic-release runs
 * (docs/releasing.md#the-deploy-key).
 *
 * With `--drawn`, alone or after the version, nothing is drawn and no
 * browser is started: every drawing must be in the drawings' cache, and
 * pass the checks, or it fails. The release's archive takes them from
 * the cache so.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { checkSvg, type DrawInputs, fontNotice } from "@solid-memo/build-tools/diagrams";
import {
  type DocsIo,
  type Draw,
  renderDocsSite,
  repositoryIo,
} from "@solid-memo/build-tools/docsSite";
import {
  CACHE_DIR,
  drawDiagrams,
  drawInputs,
  type Launch,
  launchChromium,
} from "@solid-memo/build-tools/drawDiagrams";
import { siteOrigin } from "@solid-memo/build-tools/siteMap";
import { loadEnv } from "vite";
import { siteConfig } from "../apps/web/src/config.ts";
import { isReleaseVersion } from "./releaseVersion.ts";

/** The folder the archive is written to, from the repository's root; git ignores it. */
export const ASSETS_DIR = "release-assets";

/** The archive of a version's docs, by its path from the repository's root. */
export function archivePath(version: string): string {
  return `${ASSETS_DIR}/docs-${version}.tar.gz`;
}

export type ArchiveIo = {
  /** The repository, as the site's build reads the docs. */
  docs: DocsIo;
  /** The repository's web address the site's build links to (VITE_REPO_URL, checked). */
  repoUrl(): string;
  /** The site's origin, from CNAME, as the site's build reads it; null without one. */
  origin(): string | null;
  /** What the drawings depend on besides their source. */
  inputs(): Promise<DrawInputs>;
  /** Draws the diagrams, failing when they cannot be; with `browser` false, takes them all from the cache, or fails. */
  draw(inputs: DrawInputs, browser: boolean): Draw;
  /** Packs the files, by their path below `docs/`, into the archive at `path` from the repository's root. */
  pack(files: ReadonlyMap<string, string>, path: string): Promise<void>;
  log(message: string): void;
};

/**
 * The repository at `root`, with the docs drawn in Chromium (`launch`)
 * and the repository's address the site's build takes, from the
 * environment and apps/web's .env files.
 */
export function defaultIo(
  root: string,
  options: { launch?: Launch; cacheDir?: string } = {},
): ArchiveIo {
  const { launch = launchChromium, cacheDir = CACHE_DIR } = options;
  return {
    docs: repositoryIo(root),
    repoUrl: () => siteConfig(loadEnv("production", join(root, "apps/web"), "VITE_")).repoUrl,
    origin: () => siteOrigin(join(root, "CNAME")),
    inputs: drawInputs,
    // `required`, whatever DOCS_DIAGRAMS says: without Chromium, it
    // fails. Without a browser, `cached`: a drawing not in the cache fails.
    draw: (inputs, browser) => (diagrams) =>
      drawDiagrams(diagrams, {
        inputs,
        cacheDir,
        mode: browser ? "required" : "cached",
        launch,
      }),
    async pack(files, path) {
      const staging = await mkdtemp(join(tmpdir(), "solid-memo-docs-archive-"));
      try {
        const entries = [...files.keys()].sort().map((name) => `docs/${name}`);
        for (const [name, content] of files) {
          const file = join(staging, "docs", name);
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, content);
        }
        const archive = join(root, path);
        await mkdir(dirname(archive), { recursive: true });
        // The files named one by one, in order, so the archive lists them
        // the same way on every machine, and holds nothing else.
        await promisify(execFile)("tar", ["-czf", archive, "-C", staging, ...entries]);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
    },
    log: (message) => console.log(message),
  };
}

/**
 * Why the rendered docs cannot be archived, one line each: diagrams that
 * were not drawn, or a drawing that is not safe to serve or lacks the
 * font's notice. Empty when they can.
 */
export function archiveProblems(
  files: ReadonlyMap<string, string>,
  drawn: boolean,
  inputs: DrawInputs,
): string[] {
  if (!drawn) return ["the diagrams were not drawn"];
  const notice = fontNotice(inputs.license);
  const problems: string[] = [];
  for (const [path, content] of files) {
    if (!path.endsWith(".svg")) continue;
    const refused = checkSvg(content);
    if (refused !== null) problems.push(`docs/${path}: ${refused}`);
    else if (!content.includes(notice)) problems.push(`docs/${path}: lacks the font's notice`);
  }
  return problems;
}

/** What the arguments ask for, or null when they ask for nothing known. */
function parse(
  args: readonly string[],
): { version: string; drawOnly: boolean; browser: boolean } | null {
  // Drawing only, the version names no file and is shown in no page kept.
  if (args.length === 1 && (args[0] === "--draw" || args[0] === "--drawn")) {
    return { version: "0.0.0", drawOnly: true, browser: args[0] === "--draw" };
  }
  const browser = args.length === 1;
  const version = args[0];
  if (!browser && (args.length !== 2 || args[1] !== "--drawn")) return null;
  if (version === undefined || !isReleaseVersion(version)) return null;
  return { version, drawOnly: false, browser };
}

/**
 * Exit code: 0 when the archive is written, or with `--draw` when the
 * diagrams are drawn, or with `--drawn` alone when they are all in the
 * cache and pass the checks.
 */
export async function main(argv: readonly string[], io: ArchiveIo): Promise<number> {
  // `node -e` puts the node binary first and drops the `--`.
  const asked = parse(argv.slice(1));
  if (asked === null) {
    io.log("Usage: npm run docs:archive -- <MAJOR.MINOR.PATCH> [--drawn] | --draw | --drawn");
    return 2;
  }
  const { version, drawOnly, browser } = asked;
  const path = archivePath(version);
  try {
    const inputs = await io.inputs();
    const draw = io.draw(inputs, browser);
    let drawn = true;
    const files = await renderDocsSite({
      io: io.docs,
      repoUrl: io.repoUrl(),
      ref: `v${version}`,
      version,
      origin: io.origin(),
      mode: "archive",
      inputs,
      draw: async (diagrams) => {
        const drawings = await draw(diagrams);
        drawn &&= drawings !== null;
        return drawings;
      },
    });
    const problems = archiveProblems(files, drawn, inputs);
    if (problems.length > 0) {
      const failed = drawOnly ? "The docs' diagrams are not drawn:" : `${path} is not written:`;
      io.log([failed, ...problems.map((problem) => `  ${problem}`)].join("\n"));
      return 1;
    }
    const drawings = [...files.keys()].filter((name) => name.endsWith(".svg")).length;
    if (drawOnly) {
      io.log(
        browser
          ? `The docs' ${drawings} drawings are drawn, and kept for the archive.`
          : `The docs' ${drawings} drawings are all in the drawings' cache, and pass the checks.`,
      );
      return 0;
    }
    await io.pack(files, path);
    io.log(`${path}: the docs of ${version}, ${files.size} files, ${drawings} drawings.`);
    return 0;
  } catch (error) {
    io.log((error as Error).message);
    return 1;
  }
}

/** The script entry: `node -e "import('./scripts/docsArchive.ts').then((m) => m.run(process))" -- <version>`. */
export async function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): Promise<void> {
  process.exitCode = await main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
