// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultIo, main, run, type SiteVersionIo } from "./siteVersion.ts";

const DIST = resolve("/site");
const PAGE =
  '<head><meta name="version" content="4.1.2" /></head><script src="assets/index-abc.js"></script>';
const DOC =
  '<header><p class="version">Version 4.1.2 · <a href="versions/">All versions</a></p></header>';
const VERSIONS = '<header><p class="version">Version 4.1.2</p></header>';

/** A built site in memory, with the repository at `version`. */
function fakeIo(
  files: Record<string, string>,
  version = "4.2.0",
): SiteVersionIo & { files: () => string[]; written: Map<string, string>; logs: string[] } {
  const written = new Map<string, string>();
  const logs: string[] = [];
  const paths = Object.keys(files).map((path) => join(DIST, path));
  return {
    version: () => version,
    exists: (path) => paths.some((file) => file === path || file.startsWith(`${path}/`)),
    files: () => paths.filter((path) => path.startsWith(join(DIST, "docs/"))),
    read: (path) => files[path.slice(DIST.length + 1)]!,
    write: (path, text) => written.set(path.slice(DIST.length + 1), text),
    log: (message) => logs.push(message),
    written,
    logs,
  };
}

const site = {
  "index.html": PAGE,
  "assets/index-abc.js": "the script",
  "docs/index.html": DOC,
  "docs/testing/index.html": DOC,
  "docs/versions/index.html": VERSIONS,
  "docs/docs.css": "p {}",
  "docs/diagrams/a.svg": "<svg/>",
};

describe("main", () => {
  it("states the repository's version in the app's page and every page of the docs, and nothing else", () => {
    const io = fakeIo(site);
    expect(main(["node", DIST], io)).toBe(0);
    expect(Object.fromEntries(io.written)).toEqual({
      "index.html": PAGE.replace("4.1.2", "4.2.0"),
      "docs/index.html": DOC.replace("4.1.2", "4.2.0"),
      "docs/testing/index.html": DOC.replace("4.1.2", "4.2.0"),
      "docs/versions/index.html": VERSIONS.replace("4.1.2", "4.2.0"),
    });
    expect(io.logs).toEqual([`${DIST}: version 4.2.0, in index.html and 3 pages of the docs.`]);
  });

  it("writes nothing when a page states no version, and names it", () => {
    const io = fakeIo({
      ...site,
      "docs/testing/index.html": "<header></header>",
      "index.html": "<head></head>",
    });
    expect(main(["node", DIST], io)).toBe(1);
    expect(io.written.size).toBe(0);
    expect(io.logs).toEqual([
      "These pages state no version, so nothing was changed: index.html, docs/testing/index.html.",
    ]);
  });

  it("refuses a site that is not built", () => {
    for (const files of [{ "docs/index.html": DOC }, { "index.html": PAGE }] as Record<
      string,
      string
    >[]) {
      const io = fakeIo(files);
      expect(main(["node", DIST], io)).toBe(1);
      expect(io.logs).toEqual([
        `${DIST} has no index.html or docs/: build the site first (npm run build).`,
      ]);
    }
  });

  it("refuses a version that is not one", () => {
    const io = fakeIo(site, "4.2.0 <b>");
    expect(main(["node", DIST], io)).toBe(1);
    expect(io.written.size).toBe(0);
    expect(io.logs).toEqual(["package.json's version, 4.2.0 <b>, is not a version (X.Y.Z)."]);
  });

  it("asks for the site's folder, once", () => {
    for (const argv of [["node"], ["node", DIST, DIST]]) {
      const io = fakeIo(site);
      expect(main(argv, io)).toBe(2);
      expect(io.logs).toEqual([expect.stringContaining("Usage: npm run site:version -- <dist>")]);
    }
  });
});

/** A folder of the test's own on the disk, removed after it. */
let root: string;
afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

describe("defaultIo", () => {
  it("reads the version from package.json, and the site's files from the disk", () => {
    root = mkdtempSync(join(tmpdir(), "site-version-"));
    writeFileSync(join(root, "package.json"), '{ "version": "1.2.3" }');
    mkdirSync(join(root, "dist/docs/testing"), { recursive: true });
    writeFileSync(join(root, "dist/docs/testing/index.html"), DOC);
    const io = defaultIo(root);
    expect(io.version()).toBe("1.2.3");
    expect(io.exists(join(root, "dist/docs"))).toBe(true);
    expect(io.files(join(root, "dist/docs"))).toEqual([join(root, "dist/docs/testing/index.html")]);
    io.write(join(root, "dist/index.html"), PAGE);
    expect(io.read(join(root, "dist/index.html"))).toBe(PAGE);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    io.log("said");
    expect(log).toHaveBeenCalledWith("said");
    log.mockRestore();
  });
});

describe("run", () => {
  it("sets the exit code, stating the repository's version", () => {
    root = mkdtempSync(join(tmpdir(), "site-version-"));
    writeFileSync(join(root, "index.html"), PAGE);
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "docs/index.html"), DOC);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process: { argv: string[]; exitCode?: number } = { argv: ["node", root] };
    run(process);
    log.mockRestore();
    expect(process.exitCode).toBe(0);
    const { version } = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
    );
    expect(readFileSync(join(root, "index.html"), "utf8")).toContain(`content="${version}"`);
  });
});
