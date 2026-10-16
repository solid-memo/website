// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { type DrawInputs, embedFont, fontNotice } from "@solid-memo/markdown/tooling/diagrams";
import {
  DOCS_CSS,
  type DocsIo,
  type Draw,
  renderDocsSite,
  versionsPage,
} from "@solid-memo/markdown/tooling/docsSite";
import { drawInputs } from "@solid-memo/markdown/tooling/drawDiagrams";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveEntries,
  defaultIo,
  entryProblem,
  fileProblem,
  main,
  type ReleaseAsset,
  run,
  UPLOADER,
  type VersionsIo,
  versionTags,
} from "./docsVersions.ts";

const API = "https://api.github.com";

/** An archive's bytes, as a Response takes them. */
type Bytes = Uint8Array<ArrayBuffer>;
const REPO = "solid-memo/website";
const REPO_URL = `https://github.com/${REPO}`;

let inputs: DrawInputs;
beforeAll(async () => {
  inputs = await drawInputs();
});

let root: string;
let dist: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docs-versions-"));
  dist = join(root, "dist");
  mkdirSync(join(dist, "docs/versions"), { recursive: true });
  writeFileSync(join(dist, "docs/index.html"), "the deployed docs");
  writeFileSync(join(dist, "docs/versions/index.html"), "the build's list");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Draws each diagram as drawDiagrams does: the font embedded, with its notice. */
const fakeDraw: Draw = async (diagrams) =>
  new Map(
    diagrams.map((diagram) => {
      const svg = (theme: string) =>
        embedFont(
          `<svg viewBox="0 0 120 40"><style>text{font-family:"Fredoka";}</style><text>${diagram.title} ${theme}</text></svg>`,
          inputs.font,
          fontNotice(inputs.license),
        );
      return [diagram.hash, { light: svg("light"), dark: svg("dark") }];
    }),
  );

/** A release's docs as its archive holds them, by their path under docs/: two pages and a diagram. */
async function releaseDocs(version: string): Promise<Map<string, string>> {
  const files: Record<string, string> = {
    [DOCS_CSS]: "body{}",
    "docs/README.md": "# Docs\n\nThe docs.\n\n- [One](one.md)\n",
    "docs/one.md": [
      "# One",
      "",
      "What one is.",
      "",
      "```mermaid",
      "flowchart LR",
      "  accTitle: Flow",
      "  accDescr: How it flows.",
      "  A --> B",
      "```",
      "",
    ].join("\n"),
  };
  const docs: DocsIo = {
    pages: async () => ["README.md", "one.md"],
    read: async (path) => files[path] ?? null,
    kind: async (path) => (path in files ? "file" : null),
  };
  return renderDocsSite({
    io: docs,
    repoUrl: REPO_URL,
    ref: `v${version}`,
    version,
    mode: "archive",
    inputs,
    draw: fakeDraw,
  });
}

/**
 * An archive of files, by their path under docs/, packed with the
 * system's tar; `entries` names what is packed, the files themselves
 * by default, and `prepare` adds to the folder first.
 */
function pack(
  files: ReadonlyMap<string, string>,
  options: { entries?: string[]; prepare?: (staging: string) => void } = {},
): Bytes {
  const staging = mkdtempSync(join(root, "staging-"));
  for (const [name, content] of files) {
    mkdirSync(dirname(join(staging, "docs", name)), { recursive: true });
    writeFileSync(join(staging, "docs", name), content);
  }
  options.prepare?.(staging);
  const entries = options.entries ?? [...files.keys()].sort().map((name) => `docs/${name}`);
  const archive = join(staging, "archive.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", staging, ...entries]);
  return new Uint8Array(readFileSync(archive));
}

const sha256 = (bytes: Bytes) => createHash("sha256").update(bytes).digest("hex");

/** An asset as GitHub's API lists it, uploaded by the release's job. */
function assetOf(version: string, bytes: Bytes, more: Partial<ReleaseAsset> = {}) {
  return {
    asset: {
      name: `docs-${version}.tar.gz`,
      url: `${API}/repos/${REPO}/releases/assets/${version.replaceAll(".", "")}`,
      digest: `sha256:${sha256(bytes)}`,
      uploader: { login: UPLOADER },
      ...more,
    },
    bytes,
  };
}

/** An asset and its bytes; null for one that cannot be downloaded. */
type Served = { asset: ReleaseAsset; bytes: Bytes | null };
type Release = { tag: string; draft?: boolean; assets?: Served[] };

/** GitHub's API in memory: the releases, a hundred a page, and their assets. */
function fakeApi(releases: readonly Release[], base = API, repo = REPO) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  const fetch = async (url: string, init: { headers: Record<string, string> }) => {
    requests.push({ url, headers: init.headers });
    const pages = `${base}/repos/${repo}/releases?per_page=100&page=`;
    const page = url.startsWith(pages) ? url.slice(pages.length) : "";
    if (/^\d+$/.test(page)) {
      const from = (Number(page) - 1) * 100;
      return Response.json(
        releases.slice(from, from + 100).map((release) => ({
          tag_name: release.tag,
          draft: release.draft ?? false,
          assets: (release.assets ?? []).map(({ asset }) => asset),
        })),
      );
    }
    for (const release of releases)
      for (const { asset, bytes } of release.assets ?? [])
        if (asset.url === url && bytes !== null) return new Response(bytes);
    return new Response("Not Found", { status: 404 });
  };
  return { fetch, requests };
}

/** The script's world: the environment, GitHub's API, and what it logs. */
function io(
  env: Record<string, string | undefined>,
  api: ReturnType<typeof fakeApi>,
  repoUrl = REPO_URL,
): VersionsIo & { logged: string[]; checked: { digest: string; repo: string }[] } {
  const logged: string[] = [];
  const checked: { digest: string; repo: string }[] = [];
  return {
    env,
    fetch: api.fetch,
    repoUrl: () => repoUrl,
    version: () => "2.2.0",
    async attested(file, repo) {
      checked.push({ digest: sha256(readFileSync(file)), repo });
    },
    log: (message) => void logged.push(message),
    logged,
    checked,
  };
}

const ENV = { DOCS_TAGS: "v2.2.0", GH_REPO: REPO, GH_TOKEN: "token" };
const list = () => readFileSync(join(dist, "docs/versions/index.html"), "utf8");

describe("docsVersions", () => {
  it("serves each release's archive under its version, and lists every tag, newest first", async () => {
    const docs = await releaseDocs("2.2.0");
    const served = assetOf("2.2.0", pack(docs));
    // A hundred releases a page: the ones that count are on the second.
    const filler = Array.from({ length: 100 }, (_, index) => ({ tag: `v0.0.${index}` }));
    const api = fakeApi([
      ...filler,
      {
        tag: "v2.2.0",
        assets: [{ asset: { ...served.asset, name: "other.zip" }, bytes: served.bytes }, served],
      },
      { tag: "v2.1.1" },
      { tag: "v2.0.0", draft: true, assets: [assetOf("2.0.0", pack(docs))] },
    ]);
    const script = io({ ...ENV, DOCS_TAGS: "v2.0.0\nv2.2.0\n\nv2.1.1\nv2.2.0\n" }, api);
    expect(await main(["node", dist], script)).toBe(0);
    for (const [path, content] of docs)
      expect(readFileSync(join(dist, "docs/2.2.0", path), "utf8"), path).toBe(content);
    expect(readFileSync(join(dist, "docs/index.html"), "utf8")).toBe("the deployed docs");
    expect(existsSync(join(dist, "docs/2.0.0"))).toBe(false);
    expect(list()).toBe(
      versionsPage({ repoUrl: REPO_URL, version: "2.2.0" }, [
        { version: "2.2.0", hosted: true },
        { version: "2.1.1", hosted: false },
        { version: "2.0.0", hosted: false },
      ]),
    );
    expect(script.logged).toEqual([
      "::notice::v2.1.1 has no docs-2.1.1.tar.gz on a GitHub release: its docs are linked in the repository.",
      "::notice::v2.0.0 has no docs-2.0.0.tar.gz on a GitHub release: its docs are linked in the repository.",
      "docs/versions/: 3 versions, the docs of 1 served under /docs/X.Y.Z/ (2.2.0).",
    ]);
    expect(api.requests.map(({ url }) => url)).toEqual([
      `${API}/repos/${REPO}/releases?per_page=100&page=1`,
      `${API}/repos/${REPO}/releases?per_page=100&page=2`,
      served.asset.url,
    ]);
    expect(api.requests[0]!.headers).toEqual({
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: "Bearer token",
    });
    expect(api.requests[2]!.headers.Accept).toBe("application/octet-stream");
    expect(api.requests[2]!.headers.Authorization).toBe("Bearer token");
    // The attestation is looked for of the bytes downloaded, in the repository's own name.
    expect(script.checked).toEqual([{ digest: sha256(served.bytes), repo: REPO }]);
  });

  it("leaves out an archive GitHub holds no attestation of, before unpacking it", async () => {
    const api = fakeApi([
      { tag: "v2.2.0", assets: [assetOf("2.2.0", pack(await releaseDocs("2.2.0")))] },
    ]);
    const script = io(ENV, api);
    script.attested = async () => {
      throw new Error("not attested");
    };
    expect(await main(["node", dist], script)).toBe(0);
    expect(script.logged[0]).toBe(
      "::error::docs-2.2.0.tar.gz of v2.2.0 is not served: not attested.",
    );
    expect(existsSync(join(dist, "docs/2.2.0"))).toBe(false);
  });

  it("takes an archive with its folders listed too", async () => {
    const docs = await releaseDocs("2.2.0");
    const api = fakeApi([
      { tag: "v2.2.0", assets: [assetOf("2.2.0", pack(docs, { entries: ["docs"] }))] },
    ]);
    expect(await main(["node", dist], io(ENV, api))).toBe(0);
    expect(readFileSync(join(dist, "docs/2.2.0/index.html"), "utf8")).toBe(docs.get("index.html"));
  });

  it("finds the repository on github.com from its address, and the API where GitHub says", async () => {
    const base = "https://github.example/api/v3";
    const api = fakeApi([{ tag: "v2.2.0" }], base, "fork/memo");
    const script = io(
      { DOCS_TAGS: "v2.2.0", GITHUB_API_URL: base },
      api,
      "https://github.com/fork/memo",
    );
    expect(await main(["node", dist], script)).toBe(0);
    expect(api.requests).toEqual([
      {
        url: `${base}/repos/fork/memo/releases?per_page=100&page=1`,
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      },
    ]);
    expect(script.logged.at(-1)).toBe(
      "docs/versions/: 1 versions, the docs of 0 served under /docs/X.Y.Z/.",
    );
  });

  it.each<[string, (bytes: Bytes) => Served, string]>([
    [
      "uploaded by someone else",
      (bytes) => assetOf("2.2.0", bytes, { uploader: { login: "someone" } }),
      "uploaded by someone, not by github-actions[bot]",
    ],
    [
      "uploaded by no one GitHub names",
      (bytes) => assetOf("2.2.0", bytes, { uploader: null }),
      "uploaded by no one, not by github-actions[bot]",
    ],
    [
      "without a digest",
      (bytes) => assetOf("2.2.0", bytes, { digest: null }),
      "GitHub gives no sha256 digest of it",
    ],
    [
      "whose bytes do not match its digest",
      (bytes) => assetOf("2.2.0", bytes, { digest: `sha256:${"0".repeat(64)}` }),
      "its bytes do not match its digest",
    ],
    [
      "off the API",
      (bytes) => assetOf("2.2.0", bytes, { url: "https://example.org/docs-2.2.0.tar.gz" }),
      "its address, https://example.org/docs-2.2.0.tar.gz, is not on the API",
    ],
    [
      "that cannot be downloaded",
      (bytes) => ({ ...assetOf("2.2.0", bytes), bytes: null }),
      "its download answered 404",
    ],
    [
      "that is no archive",
      () => assetOf("2.2.0", new TextEncoder().encode("not gzip")),
      "Command failed: tar -tzf",
    ],
  ])("leaves out an archive %s", async (_, served, problem) => {
    const api = fakeApi([{ tag: "v2.2.0", assets: [served(pack(await releaseDocs("2.2.0")))] }]);
    const script = io(ENV, api);
    expect(await main(["node", dist], script)).toBe(0);
    expect(script.logged[0]).toContain(
      `::error::docs-2.2.0.tar.gz of v2.2.0 is not served: ${problem}`,
    );
    expect(existsSync(join(dist, "docs/2.2.0"))).toBe(false);
    expect(list()).toContain("<li>2.2.0 · ");
  });

  it.each<[string, (docs: Map<string, string>) => Bytes, string]>([
    [
      "a link",
      (docs) =>
        pack(docs, {
          prepare: (staging) => symlinkSync("/etc/hostname", join(staging, "docs/host.html")),
          entries: ["docs/index.html", "docs/host.html"],
        }),
      "docs/host.html: neither a file nor a folder",
    ],
    [
      "a file outside docs/",
      (docs) =>
        pack(docs, {
          prepare: (staging) => writeFileSync(join(staging, "page.html"), ""),
          entries: ["docs/index.html", "page.html"],
        }),
      "page.html: not under docs/",
    ],
    [
      "a script",
      (docs) => pack(new Map([...docs, ["app.js", "alert(1)"]])),
      "docs/app.js: a file of a kind the docs do not have",
    ],
    [
      "a file twice",
      // Added again by a second run of tar, it is a file, not a link to the first.
      (docs) => {
        const staging = mkdtempSync(join(root, "twice-"));
        mkdirSync(join(staging, "docs"));
        writeFileSync(join(staging, "docs/index.html"), docs.get("index.html")!);
        const archive = join(staging, "archive.tar");
        execFileSync("tar", ["-cf", archive, "-C", staging, "docs/index.html"]);
        execFileSync("tar", ["-rf", archive, "-C", staging, "docs/index.html"]);
        return new Uint8Array(gzipSync(readFileSync(archive)));
      },
      "a file listed twice",
    ],
    [
      "no front page",
      (docs) => pack(new Map([...docs].filter(([path]) => path !== "index.html"))),
      "no docs/index.html",
    ],
    [
      "drawings without the font's license",
      (docs) => pack(new Map([...docs].filter(([path]) => !path.endsWith(".txt")))),
      "drawings without docs/diagrams/OFL-Fredoka.txt",
    ],
    [
      "a page that runs a script",
      (docs) =>
        pack(
          new Map([
            ...docs,
            [
              "index.html",
              docs.get("index.html")!.replace("<main", "<script>alert(1)</script><main"),
            ],
          ]),
        ),
      "docs/index.html: has a <script> element",
    ],
    [
      "a stylesheet that loads a file",
      (docs) => pack(new Map([...docs, ["docs.css", "body{background:url(x.png)}"]])),
      "docs/docs.css: loads a file (url())",
    ],
    [
      "a drawing with a script",
      (docs) =>
        pack(
          new Map([...docs, ["diagrams/x-0123abcd.svg", '<svg viewBox="0 0 1 1"><script/></svg>']]),
        ),
      "docs/diagrams/x-0123abcd.svg: has a <script> element",
    ],
  ])("leaves out an archive with %s", async (_, archive, problem) => {
    const api = fakeApi([
      { tag: "v2.2.0", assets: [assetOf("2.2.0", archive(await releaseDocs("2.2.0")))] },
    ]);
    const script = io(ENV, api);
    expect(await main(["node", dist], script)).toBe(0);
    expect(script.logged[0]).toMatch(/^::error::docs-2\.2\.0\.tar\.gz of v2\.2\.0 is not served: /);
    expect(script.logged[0]).toContain(problem);
    expect(existsSync(join(dist, "docs/2.2.0"))).toBe(false);
  });

  it("never writes over what the build has", async () => {
    mkdirSync(join(dist, "docs/2.2.0"));
    const api = fakeApi([
      { tag: "v2.2.0", assets: [assetOf("2.2.0", pack(await releaseDocs("2.2.0")))] },
    ]);
    const script = io(ENV, api);
    expect(await main(["node", dist], script)).toBe(0);
    expect(script.logged[0]).toBe(
      "::error::docs-2.2.0.tar.gz of v2.2.0 is not served: docs/2.2.0/ is in the build already.",
    );
    expect(api.requests).toHaveLength(1);
  });

  it("lists every tag with its docs in the repository when GitHub's API cannot be read", async () => {
    const api = fakeApi([]);
    const script = io(ENV, { ...api, fetch: async () => new Response("down", { status: 503 }) });
    expect(await main(["node", dist], script)).toBe(0);
    expect(script.logged[0]).toBe(
      `::error::GitHub's API could not list the releases (${API}/repos/${REPO}/releases?per_page=100&page=1 answered 503), so only the deployed docs are served, at /docs/.`,
    );
    expect(list()).toBe(
      versionsPage({ repoUrl: REPO_URL, version: "2.2.0" }, [{ version: "2.2.0", hosted: false }]),
    );
  });

  it.each<[string, string[], Record<string, string | undefined>, string, string]>([
    ["no folder", [], ENV, REPO_URL, "Name the built site's folder, once."],
    ["two folders", ["a", "b"], ENV, REPO_URL, "Name the built site's folder, once."],
    ["no tags", ["dist"], { GH_REPO: REPO }, REPO_URL, "DOCS_TAGS is not set."],
    [
      "a tag that is not a version",
      ["dist"],
      { ...ENV, DOCS_TAGS: "v2.2.0\nv2.2.0-rc.1" },
      REPO_URL,
      'DOCS_TAGS: "v2.2.0-rc.1" is not a version tag (vX.Y.Z).',
    ],
    [
      "no repository on GitHub",
      ["dist"],
      { DOCS_TAGS: "v2.2.0" },
      "https://codeberg.org/fork/memo",
      "GH_REPO is not set.",
    ],
  ])("asks for what it needs: %s", async (_, args, env, repoUrl, why) => {
    const script = io(env, fakeApi([]), repoUrl);
    expect(await main(["node", ...args], script)).toBe(2);
    expect(script.logged).toEqual([
      `${why}\nUsage: DOCS_TAGS="$(git tag --list 'v*')" npm run docs:versions -- <dist> (GH_REPO=<owner>/<repository> unless VITE_REPO_URL is on github.com)`,
    ]);
  });

  it("needs the site built first", async () => {
    const script = io(ENV, fakeApi([]));
    const empty = join(root, "empty");
    expect(await main(["node", empty], script)).toBe(1);
    expect(script.logged).toEqual([
      `${empty} has no docs/index.html: build the site first (npm run build).`,
    ]);
  });
});

describe("versionTags", () => {
  it("orders the tags by version, newest first, each once", () => {
    expect(versionTags(" v2.9.0\nv10.0.0\nv2.10.0\n\nv2.9.1\nv2.9.0\nv2.10.0\n")).toEqual([
      "v10.0.0",
      "v2.10.0",
      "v2.9.1",
      "v2.9.0",
    ]);
    expect(versionTags("")).toEqual([]);
    expect(() => versionTags("2.2.0")).toThrow('"2.2.0" is not a version tag (vX.Y.Z)');
  });
});

describe("the archive's entries", () => {
  it("pairs each name with its kind, and refuses listings that do not add up", () => {
    expect(
      archiveEntries(
        "docs/\ndocs/index.html\n",
        "drwxr-xr-x u/g 0 2026-10-16 12:00 docs/\n-rw-r--r-- u/g 9 2026-10-16 12:00 docs/index.html\n",
      ),
    ).toEqual([
      { name: "docs/", kind: "d" },
      { name: "docs/index.html", kind: "-" },
    ]);
    expect(() => archiveEntries("docs/a.html\ndocs/b.html", "-rw-r--r-- docs/a.html")).toThrow(
      "its two listings do not add up",
    );
  });

  it.each<[string, string, string | null]>([
    ["docs/", "d", null],
    ["docs/diagrams/", "d", null],
    ["docs/index.html", "-", null],
    ["docs/docs.css", "-", null],
    ["docs/diagrams/data-model-0123abcd.dark.svg", "-", null],
    ["docs/diagrams/OFL-Fredoka.txt", "-", null],
    ["docs/notes.txt", "-", "docs/notes.txt: a file of a kind the docs do not have"],
    ["docs/a.html", "l", "docs/a.html: neither a file nor a folder"],
    ["docs/a.html", "h", "docs/a.html: neither a file nor a folder"],
    ["/etc/passwd", "-", "/etc/passwd: not under docs/"],
    ["other/a.html", "-", "other/a.html: not under docs/"],
    ["docs/../a.html", "-", "docs/../a.html: a name that is not plain"],
    ["docs/./a.html", "-", "docs/./a.html: a name that is not plain"],
    ["docs//a.html", "-", "docs//a.html: a name that is not plain"],
    ["docs/a b.html", "-", "docs/a b.html: a name that is not plain"],
  ])("checks %s (%s)", (name, kind, problem) => {
    expect(entryProblem({ name, kind })).toBe(problem);
  });

  it("checks each file as the build checks its own", () => {
    expect(fileProblem("docs/a.html", "<p>")).toBe(
      "docs/a.html: does not start with <!doctype html>",
    );
    expect(fileProblem("docs/docs.css", "@import 'a.css';")).toBe("docs/docs.css: has an @import");
    expect(fileProblem("docs/diagrams/a.svg", "<p>")).toBe(
      "docs/diagrams/a.svg: does not start with <svg>",
    );
    expect(fileProblem("docs/diagrams/OFL-Fredoka.txt", "Copyright")).toBeNull();
  });
});

describe("defaultIo", () => {
  it("reads the repository's address and version, and asks GitHub's API with fetch", async () => {
    vi.stubEnv("VITE_REPO_URL", undefined);
    mkdirSync(join(root, "apps/web"), { recursive: true });
    writeFileSync(join(root, "apps/web/.env"), "VITE_REPO_URL=https://example.org/fork/\n");
    writeFileSync(join(root, "package.json"), '{ "version": "9.8.7" }');
    const script = defaultIo(root);
    expect(script.repoUrl()).toBe("https://example.org/fork");
    expect(script.version()).toBe("9.8.7");
    expect(script.env).toBe(process.env);
    const fetched = vi.fn(async () => new Response("answer"));
    vi.stubGlobal("fetch", fetched);
    const response = await script.fetch(`${API}/x`, { headers: { Accept: "text/plain" } });
    expect(await response.text()).toBe("answer");
    expect(fetched).toHaveBeenCalledWith(`${API}/x`, { headers: { Accept: "text/plain" } });
  });

  it("asks GitHub's CLI for an attestation by the release workflow on main, and says why there is none", async () => {
    const bin = mkdtempSync(join(tmpdir(), "solid-memo-gh-"));
    const calls = join(bin, "calls");
    writeFileSync(
      join(bin, "gh"),
      `#!/bin/sh\necho "$@" >> "${calls}"\n[ "$1 $2 $3" = "attestation verify good.tar.gz" ] && exit 0\n[ "$3" = silent.tar.gz ] && exit 1\necho "no attestations found\nmore" >&2\nexit 1\n`,
      { mode: 0o755 },
    );
    vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
    const script = defaultIo(root);
    await expect(script.attested("good.tar.gz", "team/memo")).resolves.toBeUndefined();
    await expect(script.attested("bad.tar.gz", "team/memo")).rejects.toThrow(
      "GitHub holds no attestation that .github/workflows/release.yml made it on main (no attestations found)",
    );
    await expect(script.attested("silent.tar.gz", "team/memo")).rejects.toThrow(
      "made it on main (Command failed: gh attestation verify silent.tar.gz",
    );
    expect(readFileSync(calls, "utf8").split("\n")[0]).toBe(
      "attestation verify good.tar.gz --repo team/memo --signer-workflow team/memo/.github/workflows/release.yml --source-ref refs/heads/main --deny-self-hosted-runners",
    );
    rmSync(bin, { recursive: true, force: true });
  });

  it("logs to the console, and is left alone by a run without a folder", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo(root).log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    const process = { argv: ["node"], exitCode: undefined as number | string | null | undefined };
    await run(process);
    expect(process.exitCode).toBe(2);
    log.mockRestore();
  });
});
