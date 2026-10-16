// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run docs:versions -- <dist>`: serves each release's docs beside
 * the deployed version's (docs/deployment.md#each-releases-docs), after
 * `npm run build` and before the deploy uploads `<dist>`. For every
 * version tag (DOCS_TAGS, one a line), it looks for the archive of the
 * docs that the release attached to its GitHub release
 * (`docs-X.Y.Z.tar.gz`, scripts/docsArchive.ts), and unpacks it into
 * `<dist>/docs/X.Y.Z/`. Then it writes the list of versions,
 * `<dist>/docs/versions/index.html`, over the build's: every tag, newest
 * first, linked to its docs where the site now has them, and always to
 * its docs in the repository at the tag and to its notes.
 *
 * The archived pages run on the app's origin, which holds the learner's
 * storage, so an archive is served only when a workflow run uploaded it
 * (github-actions[bot]), its bytes match the digest GitHub gives,
 * GitHub holds an attestation that the release workflow made those
 * bytes on main (`gh attestation verify`: a workflow on any other
 * branch, which any run's token could upload with, cannot sign as that),
 * its entries are plain files and folders under `docs/` of the kinds the
 * docs have, and each file passes the checks the build holds its own
 * pages to (checkPage, checkStylesheet, checkSvg). A version
 * that fails is left out, with an error; one without an archive, such as
 * a release from before the archives or one of the upstream project's in
 * a fork, with a notice. Either way the list links its docs in the
 * repository. If GitHub's API cannot be read, only the deployed docs are
 * served.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { checkSvg } from "@solid-memo/markdown/tooling/diagrams";
import {
  checkPage,
  checkStylesheet,
  FONT_LICENSE_NAME,
  type ListedRelease,
  versionsPage,
} from "@solid-memo/markdown/tooling/docsSite";
import { loadEnv } from "vite";
import { siteConfig } from "../apps/web/src/config.ts";
import { archivePath } from "./docsArchive.ts";

/** Who uploads a release's archive: a workflow run, with its token. */
export const UPLOADER = "github-actions[bot]";

/** The workflow that attests a release's archive, run on main: the release's own. */
export const SIGNER = ".github/workflows/release.yml";

/** The font's license beside the drawings, the one file that is neither page, stylesheet nor drawing. */
const LICENSE_ENTRY = `docs/diagrams/${FONT_LICENSE_NAME}`;

/** An asset of a release, as GitHub's API lists it. */
export type ReleaseAsset = {
  name: string;
  /** Its address on the API, which downloads it. */
  url: string;
  /** `sha256:<hex>`, from the API; null when it gives none. */
  digest: string | null;
  uploader: { login: string } | null;
};

/** A release, as GitHub's API lists it. */
type ApiRelease = { tag_name: string; draft: boolean; assets: ReleaseAsset[] };

/** A request to GitHub's API: `fetch`, with only what the script sends. */
export type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

export type VersionsIo = {
  /** DOCS_TAGS, GH_REPO, GH_TOKEN and GITHUB_API_URL. */
  env: Record<string, string | undefined>;
  fetch: Fetch;
  /** The repository's web address the site's build links to (VITE_REPO_URL, checked). */
  repoUrl(): string;
  /** The version deployed, the repository's (package.json). */
  version(): string;
  /**
   * Resolves when GitHub holds an attestation that SIGNER, run on main
   * in `repo`, made the file; throws, saying why, when it does not.
   */
  attested(file: string, repo: string): Promise<void>;
  log(message: string): void;
};

const exec = promisify(execFile);

/** The repository at `root`, GitHub's API on the web, and GitHub's CLI for attestations. */
export function defaultIo(root: string): VersionsIo {
  return {
    env: process.env,
    fetch: (url, init) => fetch(url, init),
    repoUrl: () => siteConfig(loadEnv("production", join(root, "apps/web"), "VITE_")).repoUrl,
    version: () =>
      (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }).version,
    async attested(file, repo) {
      const signer = ["--signer-workflow", `${repo}/${SIGNER}`, "--source-ref", "refs/heads/main"];
      const args = ["attestation", "verify", file, "--repo", repo, ...signer];
      try {
        await exec("gh", [...args, "--deny-self-hosted-runners"]);
      } catch (error) {
        const { stderr, message } = error as { stderr?: string; message: string };
        const why = (stderr?.trim() || message).split("\n")[0];
        throw new Error(`GitHub holds no attestation that ${SIGNER} made it on main (${why})`);
      }
    },
    log: (message) => console.log(message),
  };
}

const VERSION_TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** The version tags, one a line, newest first, each once; throws on a line that is not one. */
export function versionTags(text: string): string[] {
  const tags = new Set<string>();
  for (const line of text.split("\n").map((part) => part.trim())) {
    if (line === "") continue;
    if (!VERSION_TAG.test(line)) throw new Error(`"${line}" is not a version tag (vX.Y.Z)`);
    tags.add(line);
  }
  const parts = (tag: string) => VERSION_TAG.exec(tag)!.slice(1).map(Number);
  return [...tags].sort((a, b) => {
    const [x, y] = [parts(a), parts(b)];
    return y[0]! - x[0]! || y[1]! - x[1]! || y[2]! - x[2]!;
  });
}

/** An entry of an archive: its name, and its kind, the first letter `tar -tv` gives it (`-` a file, `d` a folder). */
export type ArchiveEntry = { name: string; kind: string };

/**
 * The entries of an archive, from its two listings, `tar -tzf`'s names
 * and `tar -tvzf`'s lines, which list them in the same order; throws when
 * they do not add up.
 */
export function archiveEntries(names: string, lines: string): ArchiveEntry[] {
  const split = (text: string) => text.split("\n").filter((line) => line !== "");
  const [named, listed] = [split(names), split(lines)];
  if (named.length !== listed.length) throw new Error("its two listings do not add up");
  return named.map((name, index) => ({ name, kind: listed[index]!.charAt(0) }));
}

/**
 * Why an entry of an archive is refused; null when it is not. An archive
 * holds plain files and folders under `docs/`, each part of their names
 * plain (letters, digits, `.`, `_` and `-`, never `.` or `..`): pages,
 * stylesheets and drawings, and the font's license.
 */
export function entryProblem({ name, kind }: ArchiveEntry): string | null {
  if (kind !== "-" && kind !== "d") return `${name}: neither a file nor a folder`;
  const parts = name.replace(/\/$/, "").split("/");
  if (parts[0] !== "docs") return `${name}: not under docs/`;
  if (parts.some((part) => !/^[\w.-]+$/.test(part) || /^\.\.?$/.test(part)))
    return `${name}: a name that is not plain`;
  if (kind === "d") return null;
  if (/\.(html|css|svg)$/.test(name) || name === LICENSE_ENTRY) return null;
  return `${name}: a file of a kind the docs do not have`;
}

/** Why a file of an archive is not served; null when it is. */
export function fileProblem(name: string, content: string): string | null {
  const refused = name.endsWith(".html")
    ? checkPage(content)
    : name.endsWith(".css")
      ? checkStylesheet(content)
      : name.endsWith(".svg")
        ? checkSvg(content)
        : null;
  return refused === null ? null : `${name}: ${refused}`;
}

/**
 * The files of an archive, by their names under `docs/`, once it is
 * attested (`attested`, given the file) and every entry and every file
 * is checked; throws with what is refused.
 */
async function unpack(
  archive: Uint8Array,
  attested: (file: string) => Promise<void>,
): Promise<Map<string, Buffer>> {
  const staging = await mkdtemp(join(tmpdir(), "solid-memo-docs-versions-"));
  try {
    const file = join(staging, "docs.tar.gz");
    await writeFile(file, archive);
    await attested(file);
    const entries = archiveEntries(
      (await exec("tar", ["-tzf", file])).stdout,
      (await exec("tar", ["-tvzf", file])).stdout,
    );
    const problems = entries.map(entryProblem).filter((problem) => problem !== null);
    const files = entries.filter(({ kind }) => kind === "-").map(({ name }) => name);
    if (new Set(files).size !== files.length) problems.push("a file listed twice");
    if (!files.includes("docs/index.html")) problems.push("no docs/index.html");
    if (files.some((name) => name.endsWith(".svg")) && !files.includes(LICENSE_ENTRY))
      problems.push(`drawings without ${LICENSE_ENTRY}`);
    if (problems.length > 0) throw new Error(problems.join("; "));
    const out = join(staging, "out");
    await mkdir(out);
    await exec("tar", ["-xzf", file, "-C", out, "--no-same-owner"]);
    const unpacked = new Map<string, Buffer>();
    for (const name of files) {
      const content = await readFile(join(out, name));
      const refused = fileProblem(name, content.toString("utf8"));
      if (refused !== null) problems.push(refused);
      unpacked.set(name.slice("docs/".length), content);
    }
    if (problems.length > 0) throw new Error(problems.join("; "));
    return unpacked;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** Where GitHub's API is, which repository, and with which token. */
type Api = { base: string; repo: string; headers: Record<string, string> };

/** Every published release, by its tag. */
async function releases(io: VersionsIo, api: Api): Promise<Map<string, ReleaseAsset[]>> {
  const found = new Map<string, ReleaseAsset[]>();
  for (let page = 1; ; page++) {
    const url = `${api.base}/repos/${api.repo}/releases?per_page=100&page=${page}`;
    const response = await io.fetch(url, { headers: api.headers });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const listed = (await response.json()) as ApiRelease[];
    for (const release of listed) if (!release.draft) found.set(release.tag_name, release.assets);
    if (listed.length < 100) return found;
  }
}

/** A release's archive, downloaded and checked as the script's lead says, then unpacked. */
async function archived(
  io: VersionsIo,
  api: Api,
  asset: ReleaseAsset,
): Promise<Map<string, Buffer>> {
  if (asset.uploader?.login !== UPLOADER)
    throw new Error(`uploaded by ${asset.uploader?.login ?? "no one"}, not by ${UPLOADER}`);
  const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? "")?.[1];
  if (digest === undefined) throw new Error("GitHub gives no sha256 digest of it");
  // The token goes to the API only.
  if (!asset.url.startsWith(`${api.base}/repos/${api.repo}/releases/assets/`))
    throw new Error(`its address, ${asset.url}, is not on the API`);
  const response = await io.fetch(asset.url, {
    headers: { ...api.headers, Accept: "application/octet-stream" },
  });
  if (!response.ok) throw new Error(`its download answered ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error("its bytes do not match its digest");
  return unpack(bytes, (file) => io.attested(file, api.repo));
}

/** Exit code: 0 when the list of versions is written, whichever versions could be served. */
export async function main(argv: readonly string[], io: VersionsIo): Promise<number> {
  // `node -e` puts the node binary first and drops the `--`.
  const args = argv.slice(1);
  const usage = (why: string) => {
    io.log(
      `${why}\nUsage: DOCS_TAGS="$(git tag --list 'v*')" npm run docs:versions -- <dist> (GH_REPO=<owner>/<repository> unless VITE_REPO_URL is on github.com)`,
    );
    return 2;
  };
  if (args.length !== 1) return usage("Name the built site's folder, once.");
  const dist = resolve(args[0]!);
  const { env } = io;
  if (env.DOCS_TAGS === undefined) return usage("DOCS_TAGS is not set.");
  let tags: string[];
  try {
    tags = versionTags(env.DOCS_TAGS);
  } catch (error) {
    return usage(`DOCS_TAGS: ${(error as Error).message}.`);
  }
  const repoUrl = io.repoUrl();
  const repo = env.GH_REPO ?? /^https:\/\/github\.com\/([^/]+\/[^/]+)$/.exec(repoUrl)?.[1];
  if (repo === undefined) return usage("GH_REPO is not set.");
  if (!existsSync(join(dist, "docs/index.html"))) {
    io.log(`${dist} has no docs/index.html: build the site first (npm run build).`);
    return 1;
  }
  const api: Api = {
    base: env.GITHUB_API_URL ?? "https://api.github.com",
    repo,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(env.GH_TOKEN ? { Authorization: `Bearer ${env.GH_TOKEN}` } : {}),
    },
  };
  let published = new Map<string, ReleaseAsset[]>();
  try {
    published = await releases(io, api);
  } catch (error) {
    io.log(
      `::error::GitHub's API could not list the releases (${(error as Error).message}), so only the deployed docs are served, at /docs/.`,
    );
  }
  const listed: ListedRelease[] = [];
  for (const tag of tags) {
    const version = tag.slice(1);
    const name = basename(archivePath(version));
    const asset = published.get(tag)?.find((each) => each.name === name);
    let hosted = false;
    if (asset === undefined) {
      io.log(
        `::notice::${tag} has no ${name} on a GitHub release: its docs are linked in the repository.`,
      );
    } else {
      try {
        const target = join(dist, "docs", version);
        if (existsSync(target)) throw new Error(`docs/${version}/ is in the build already`);
        for (const [path, content] of await archived(io, api, asset)) {
          await mkdir(dirname(join(target, path)), { recursive: true });
          await writeFile(join(target, path), content);
        }
        hosted = true;
      } catch (error) {
        io.log(`::error::${name} of ${tag} is not served: ${(error as Error).message}.`);
      }
    }
    listed.push({ version, hosted });
  }
  await mkdir(join(dist, "docs/versions"), { recursive: true });
  await writeFile(
    join(dist, "docs/versions/index.html"),
    versionsPage({ repoUrl, version: io.version() }, listed),
  );
  const served = listed.filter(({ hosted }) => hosted).map(({ version }) => version);
  io.log(
    `docs/versions/: ${listed.length} versions, the docs of ${served.length} served under /docs/X.Y.Z/${served.length > 0 ? ` (${served.join(", ")})` : ""}.`,
  );
  return 0;
}

/** The script entry: `node -e "import('./scripts/docsVersions.ts').then((m) => m.run(process))" -- <dist>`. */
export async function run(process: {
  argv: readonly string[];
  exitCode?: number | string | null | undefined;
}): Promise<void> {
  process.exitCode = await main(process.argv, defaultIo(resolve(import.meta.dirname, "..")));
}
