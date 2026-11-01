// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkSvg,
  type DrawInputs,
  diagramsOf,
  embedFont,
  fontNotice,
} from "@solid-memo/site/diagrams";
import { type DocsIo, type Draw, repositoryIo } from "@solid-memo/site/docsSite";
import { drawInputs } from "@solid-memo/site/drawDiagrams";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ArchiveIo,
  archivePath,
  archiveProblems,
  defaultIo,
  main,
  run,
} from "./docsArchive.ts";

const REPO = "https://example.org/team/memo";

let inputs: DrawInputs;
beforeAll(async () => {
  inputs = await drawInputs();
});

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docs-archive-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

/** A drawing as drawDiagrams makes one: the font embedded, with its notice. */
const drawing = (title: string, theme: string) =>
  embedFont(
    `<svg viewBox="0 0 120 40"><style>text{font-family:"Fredoka";}</style><text>${title} ${theme}</text></svg>`,
    inputs.font,
    fontNotice(inputs.license),
  );

/** Draws each diagram as drawDiagrams would, without a browser. */
const fakeDraw: Draw = async (diagrams) =>
  new Map(
    diagrams.map((diagram) => [
      diagram.hash,
      { light: drawing(diagram.title, "light"), dark: drawing(diagram.title, "dark") },
    ]),
  );

/** The repository's own docs, drawn by `draw`, packed under `root`; what is logged. */
function io(
  draw: Draw = fakeDraw,
  docs: DocsIo = repositoryIo(),
): ArchiveIo & { logged: string[] } {
  const logged: string[] = [];
  return {
    ...defaultIo(root),
    docs,
    repoUrl: () => REPO,
    inputs: async () => inputs,
    draw: () => draw,
    log: (message) => void logged.push(message),
    logged,
  };
}

const tar = (...args: string[]) => execFileSync("tar", args, { encoding: "utf8" });

describe("docsArchive", () => {
  it("names the archive by its version, in release-assets/", () => {
    expect(archivePath("2.2.0")).toBe("release-assets/docs-2.2.0.tar.gz");
  });

  it.each([[[]], [["v2.2.0"]], [["2.2"]], [["2.2.0", "2.3.0"]], [["--draw", "2.2.0"]]])(
    "asks for one version, MAJOR.MINOR.PATCH (%j)",
    async (args) => {
      const archive = io();
      expect(await main(["node", ...args], archive)).toBe(2);
      expect(archive.logged).toEqual([
        "Usage: npm run docs:archive -- <MAJOR.MINOR.PATCH> | --draw",
      ]);
    },
  );

  it("packs the docs as the release carries them, under docs/, with every drawing and the font's license", async () => {
    const archive = { ...io(), origin: () => "https://memo.example" };
    expect(await main(["node", "2.2.0"], archive)).toBe(0);
    const file = join(root, "release-assets/docs-2.2.0.tar.gz");
    const entries = tar("-tzf", file).trim().split("\n");
    expect(entries.every((entry) => entry.startsWith("docs/"))).toBe(true);
    expect(entries).toEqual([...entries].sort());
    expect(entries).toEqual(
      expect.arrayContaining([
        "docs/index.html",
        "docs/docs.css",
        "docs/configuration/index.html",
        "docs/diagrams/OFL-Fredoka.txt",
      ]),
    );
    const svgs = entries.filter((entry) => entry.endsWith(".svg"));
    expect(svgs.length).toBeGreaterThan(0);
    const out = join(root, "out");
    mkdirSync(out);
    tar("-xzf", file, "-C", out);
    for (const svg of svgs) {
      const content = readFileSync(join(out, svg), "utf8");
      expect(checkSvg(content)).toBeNull();
      expect(content).toContain(fontNotice(inputs.license));
    }
    expect(readFileSync(join(out, "docs/diagrams/OFL-Fredoka.txt"), "utf8")).toBe(inputs.license);
    const page = readFileSync(join(out, "docs/configuration/index.html"), "utf8");
    expect(page).toContain('<meta name="robots" content="noindex">');
    expect(page).toContain(`${REPO}/blob/v2.2.0/`);
    expect(page).toContain(
      'These are the docs as released with Solid Memo 2.2.0. <a href="https://memo.example/docs/">Read the latest docs</a>.',
    );
    expect(archive.logged).toEqual([
      `release-assets/docs-2.2.0.tar.gz: the docs of 2.2.0, ${entries.length} files, ${svgs.length} drawings.`,
    ]);
  });

  it("writes nothing when the diagrams were not drawn", async () => {
    const archive = io(async () => null);
    expect(await main(["node", "2.2.0"], archive)).toBe(1);
    expect(archive.logged).toEqual([
      "release-assets/docs-2.2.0.tar.gz is not written:\n  the diagrams were not drawn",
    ]);
    expect(existsSync(join(root, archivePath("2.2.0")))).toBe(false);
  });

  it("with --draw, draws and checks the diagrams the archive holds, and writes no archive", async () => {
    const drawn: string[] = [];
    const archive = io(async (diagrams) => {
      drawn.push(...diagrams.map((diagram) => diagram.hash));
      return fakeDraw(diagrams);
    });
    expect(await main(["node", "--draw"], archive)).toBe(0);
    expect(drawn.length).toBeGreaterThan(0);
    expect(existsSync(join(root, "release-assets"))).toBe(false);
    expect(archive.logged).toEqual([
      expect.stringMatching(/^The docs' \d+ drawings are drawn, and kept for the archive\.$/),
    ]);
  });

  it("with --draw, fails when the diagrams were not drawn", async () => {
    const archive = io(async () => null);
    expect(await main(["node", "--draw"], archive)).toBe(1);
    expect(archive.logged).toEqual([
      "The docs' diagrams are not drawn:\n  the diagrams were not drawn",
    ]);
  });

  it("writes nothing when a drawing is not safe to serve or lacks the font's notice", () => {
    const files = new Map([
      ["index.html", "<!doctype html>"],
      ["diagrams/a.svg", drawing("A", "light")],
      ["diagrams/b.svg", '<svg viewBox="0 0 1 1"><script/></svg>'],
      ["diagrams/c.svg", '<svg viewBox="0 0 1 1"></svg>'],
    ]);
    expect(archiveProblems(files, true, inputs)).toEqual([
      "docs/diagrams/b.svg: has a <script> element",
      "docs/diagrams/c.svg: lacks the font's notice",
    ]);
  });

  it("writes nothing when the docs have problems, and says what they are", async () => {
    const docs: DocsIo = {
      pages: async () => [],
      read: async () => null,
      kind: async () => null,
    };
    const archive = io(fakeDraw, docs);
    expect(await main(["node", "2.2.0"], archive)).toBe(1);
    expect(archive.logged.join("\n")).toContain("docs/README.md: there is no README.md");
  });

  it("finds the site's origin in CNAME, as the site's build does, and none without it", () => {
    expect(defaultIo(root).origin()).toBeNull();
    writeFileSync(join(root, "CNAME"), "memo.example\n");
    expect(defaultIo(root).origin()).toBe("https://memo.example");
  });

  it("names the repository as the site's build does, from apps/web's .env files", () => {
    vi.stubEnv("VITE_REPO_URL", undefined);
    mkdirSync(join(root, "apps/web"), { recursive: true });
    writeFileSync(join(root, "apps/web/.env"), "VITE_REPO_URL=https://example.org/fork/\n");
    expect(defaultIo(root).repoUrl()).toBe("https://example.org/fork");
  });

  it("draws in Chromium even under DOCS_DIAGRAMS=skip, and fails without it", async () => {
    vi.stubEnv("DOCS_DIAGRAMS", "skip");
    vi.stubEnv("CI", "");
    const archive = defaultIo(root, {
      cacheDir: join(root, "cache"),
      launch: async () => {
        throw new Error("Executable doesn't exist");
      },
    });
    expect(archive.docs).toBeDefined();
    expect(await archive.inputs()).toEqual(inputs);
    const diagrams = diagramsOf(
      "docs/page.md",
      ["```mermaid", "flowchart LR", "  accTitle: T", "  accDescr: D.", "  A --> B", "```"].join(
        "\n",
      ),
      inputs,
    );
    await expect(archive.draw(inputs)(diagrams)).rejects.toThrow("needs Chromium");
  });

  it("logs to the console, and is left alone by a run without a version", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo(root).log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    const process = { argv: ["node"], exitCode: undefined as number | string | null | undefined };
    await run(process);
    expect(process.exitCode).toBe(2);
    expect(log).toHaveBeenCalledWith("Usage: npm run docs:archive -- <MAJOR.MINOR.PATCH> | --draw");
    log.mockRestore();
  });
});
