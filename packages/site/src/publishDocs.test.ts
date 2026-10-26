// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOCS_INDEX } from "./docsIndex.ts";
import { DOCS_CSS, type DocsIo } from "./docsSite.ts";
import type { DrawingBrowser, DrawingPage, Launch } from "./drawDiagrams.ts";
import { type DocsSitePluginOptions, docsSitePlugin } from "./publishDocs.ts";

const diagram = (title: string) =>
  [
    "```mermaid",
    "flowchart LR",
    `  accTitle: ${title}`,
    `  accDescr: How ${title} flows.`,
    "  A --> B",
    "```",
  ].join("\n");

/** The docs' index, which lists the one page. */
const INDEX = [
  "@base <https://solid-memo.com/docs/> .",
  "@prefix dcterms: <http://purl.org/dc/terms/> .",
  "@prefix schema: <https://schema.org/> .",
  "",
  '<> a schema:Collection ; dcterms:title "Docs"@en .',
  "",
  "<#pages>",
  "    a schema:Collection ;",
  '    dcterms:title "Pages"@en ;',
  "    schema:isPartOf <> ;",
  "    schema:position 10 .",
  "",
  "<one.md>",
  "    a schema:TechArticle ;",
  "    schema:isPartOf <#pages> ;",
  "    schema:position 10 ;",
  '    schema:learningResourceType "reference" ;',
  '    dcterms:abstract "the first page."@en .',
  "",
].join("\n");

/** The docs in memory: a README, a page that holds a diagram, the index that lists it, and the stylesheet. */
function memoryDocs(files: Record<string, string> = {}): Record<string, string> {
  return {
    [DOCS_CSS]: "body{}",
    [DOCS_INDEX]: INDEX,
    "docs/README.md": "# Docs\n\nThe docs.\n",
    "docs/one.md": `# One\n\nThe first page.\n\n${diagram("Flow")}\n`,
    ...files,
  };
}

/** Reads the docs from `files`, which a test may change between requests. */
function memoryIo(files: Record<string, string>): DocsIo {
  return {
    pages: async () =>
      Object.keys(files)
        .filter((path) => /^docs\/[^/]+\.md$/.test(path))
        .map((path) => path.slice("docs/".length)),
    read: async (path) => files[path] ?? null,
    kind: async (path) => (path in files ? "file" : null),
  };
}

/** A browser whose pages draw each diagram as a small SVG. */
function fakeBrowser() {
  const pages: string[] = [];
  const browser: DrawingBrowser & { closed: number } = {
    closed: 0,
    async newPage(): Promise<DrawingPage> {
      pages.push("opened");
      return {
        setContent: async () => {},
        addStyleTag: async () => undefined,
        addScriptTag: async () => undefined,
        evaluate: (async (_callback: unknown, arg: { jobs?: { id: string }[] }) =>
          arg.jobs?.map(({ id }) => ({
            svg: `<svg id="${id}" viewBox="0 0 10 10"><style></style><text>drawn</text></svg>`,
          }))) as DrawingPage["evaluate"],
        close: async () => {},
      };
    },
    async close() {
      browser.closed++;
    },
  };
  const launch = vi.fn<Launch>(async () => browser);
  return { browser, launch, pages };
}

const missingChromium = () =>
  vi.fn<Launch>(async () => {
    throw new Error("browserType.launch: Executable doesn't exist");
  });

let cacheDir: string;
beforeEach(async () => {
  cacheDir = join(await mkdtemp(join(tmpdir(), "solid-memo-docs-")), "cache");
});

function plugin(more: Partial<DocsSitePluginOptions> & { files?: Record<string, string> } = {}) {
  const { files = memoryDocs(), ...rest } = more;
  return docsSitePlugin({
    repoUrl: () => "https://example.org/team/memo",
    ref: "main",
    version: "2.2.0",
    origin: null,
    io: memoryIo(files),
    env: {},
    cacheDir,
    ...rest,
  });
}

/** The files a build emits, by name, and what it warned. */
async function build(docs: ReturnType<typeof docsSitePlugin>) {
  const emitted = new Map<string, string>();
  const warn = vi.fn();
  const context = {
    emitFile: ({ fileName, source }: { fileName: string; source: string }) =>
      void emitted.set(fileName, source),
    warn,
  };
  await (docs.generateBundle as unknown as (this: typeof context) => Promise<void>).call(context);
  return { emitted, warn };
}

describe("docsSitePlugin, in a build", () => {
  it("emits the pages under docs/, with their diagrams drawn and the font's license", async () => {
    const fake = fakeBrowser();
    const { emitted, warn } = await build(plugin({ launch: fake.launch }));
    const names = [...emitted.keys()].sort();
    expect(names.filter((name) => !name.startsWith("docs/diagrams/"))).toEqual([
      "docs/docs.css",
      "docs/index.html",
      "docs/one/index.html",
    ]);
    expect(names.filter((name) => name.endsWith(".svg"))).toHaveLength(2);
    expect(emitted.get("docs/diagrams/OFL-Fredoka.txt")).toMatch(/^Copyright /);
    expect(emitted.get("docs/one/index.html")).toContain('<img src="../diagrams/one-');
    expect(fake.launch).toHaveBeenCalledOnce();
    expect(fake.browser.closed).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("builds without drawings under DOCS_DIAGRAMS=skip, in CI too, starting no browser, and warns", async () => {
    const launch = fakeBrowser().launch;
    const { emitted, warn } = await build(
      plugin({ launch, env: { DOCS_DIAGRAMS: "skip", CI: "true" } }),
    );
    expect(emitted.get("docs/one/index.html")).toContain('<figure class="undrawn">');
    expect([...emitted.keys()].some((name) => name.startsWith("docs/diagrams/"))).toBe(false);
    expect(launch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DOCS_DIAGRAMS=skip"));
  });

  it("fails without Chromium", async () => {
    await expect(build(plugin({ launch: missingChromium() }))).rejects.toThrow("npm run browsers");
  });

  it("links into the repository at the commit, or at main, with a warning, when it is not known", async () => {
    const commit = await build(plugin({ launch: fakeBrowser().launch, ref: "1a2b3c" }));
    expect(commit.emitted.get("docs/index.html")).toContain(
      'href="https://example.org/team/memo/blob/1a2b3c/docs/README.md"',
    );
    expect(commit.warn).not.toHaveBeenCalled();
    const unknown = await build(plugin({ launch: fakeBrowser().launch, ref: null }));
    expect(unknown.emitted.get("docs/index.html")).toContain(
      'href="https://example.org/team/memo/blob/main/docs/README.md"',
    );
    expect(unknown.warn).toHaveBeenCalledOnce();
    expect(unknown.warn).toHaveBeenCalledWith(expect.stringContaining("name main"));
  });

  it("asks for the repository's address only when it renders, once the site's settings are checked", async () => {
    let repoUrl = "";
    const docs = plugin({ launch: fakeBrowser().launch, repoUrl: () => repoUrl });
    repoUrl = "https://example.org/later";
    expect((await build(docs)).emitted.get("docs/index.html")).toContain(
      'href="https://example.org/later/issues/new/choose"',
    );
  });

  it("reads the repository and draws in Chromium unless told otherwise", () => {
    const docs = docsSitePlugin({
      repoUrl: () => "x",
      ref: "main",
      version: "1.0.0",
      origin: null,
    });
    expect(docs.name).toBe("solid-memo:publish-docs");
  });
});

type Response = {
  statusCode: number;
  setHeader: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
};
type Handler = (
  req: { url?: string },
  res: Response,
  next: (error?: unknown) => void,
) => Promise<void>;

/** The plugin's dev server middleware, and what it logs. */
function devServer(docs: ReturnType<typeof docsSitePlugin>) {
  let handler: Handler | undefined;
  const warn = vi.fn();
  const server = {
    middlewares: { use: (use: Handler) => (handler = use) },
    config: { logger: { warn } },
  };
  (docs.configureServer as (server: unknown) => void)(server);
  const request = async (url: string | undefined) => {
    const res: Response = { statusCode: 200, setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    await handler!({ url }, res, next);
    return { res, next, body: res.end.mock.calls[0]?.[0] as string | undefined };
  };
  return { request, warn };
}

const closeBundle = (docs: ReturnType<typeof docsSitePlugin>) =>
  (docs.closeBundle as () => Promise<void>)();

describe("docsSitePlugin, in dev", () => {
  it("serves each page, rendered on request, and what it links to", async () => {
    const files = memoryDocs();
    const fake = fakeBrowser();
    const docs = plugin({ files, launch: fake.launch });
    const { request } = devServer(docs);

    const css = await request("/docs/docs.css");
    expect(css.res.setHeader).toHaveBeenCalledWith("Content-Type", "text/css; charset=utf-8");
    expect(css.body).toBe("body{}");

    const readme = await request("/docs/?fresh=1");
    expect(readme.res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html; charset=utf-8");
    expect(readme.body).toContain('<h1 id="docs">Docs</h1>');

    const one = await request("/docs/one/");
    const svg = /src="\.\.\/(diagrams\/one-[0-9a-f]{8}\.svg)"/.exec(one.body!)![1];
    const drawing = await request(`/docs/${svg}`);
    expect(drawing.res.setHeader).toHaveBeenCalledWith("Content-Type", "image/svg+xml");
    expect(drawing.body).toContain("drawn");
    const license = await request("/docs/diagrams/OFL-Fredoka.txt");
    expect(license.res.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain; charset=utf-8");

    // An edit shows on the next request.
    files["docs/one.md"] = "# One\n\nThe first page, edited.\n";
    expect((await request("/docs/one/")).body).toContain("edited");
    await closeBundle(docs);
  });

  it("sends the folders' addresses without a slash to the page", async () => {
    const { request } = devServer(plugin({ launch: missingChromium() }));
    for (const [url, location] of [
      ["/docs", "/docs/"],
      ["/docs/one", "/docs/one/"],
    ]) {
      const { res } = await request(url);
      expect(res.statusCode, url).toBe(302);
      expect(res.setHeader).toHaveBeenCalledWith("Location", location);
    }
  });

  it("passes other requests on", async () => {
    const { request } = devServer(plugin({ launch: missingChromium() }));
    for (const url of [
      "/index.html",
      "/docs/missing.txt",
      "/docs/nowhere/",
      "/documents",
      undefined,
    ]) {
      const { res, next } = await request(url);
      expect(res.end, url).not.toHaveBeenCalled();
      expect(next, url).toHaveBeenCalledWith();
    }
  });

  it("lists the docs' problems, and passes on any other failure", async () => {
    const files = memoryDocs({ "docs/two.md": "# Two\n" });
    const problems = await devServer(plugin({ files, launch: missingChromium() })).request(
      "/docs/",
    );
    expect(problems.res.statusCode).toBe(500);
    expect(problems.res.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/plain; charset=utf-8",
    );
    expect(problems.body).toContain("docs/two.md: docs/docs.ttl does not list the page");

    const io: DocsIo = {
      ...memoryIo(memoryDocs()),
      pages: async () => {
        throw new Error("docs/ cannot be read");
      },
    };
    const { res, next } = await devServer(plugin({ io, launch: missingChromium() })).request(
      "/docs/",
    );
    expect(res.end).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(new Error("docs/ cannot be read"));
  });

  it("starts the browser once, on the first drawing, and closes it with the server", async () => {
    const files = memoryDocs();
    const fake = fakeBrowser();
    const docs = plugin({ files, launch: fake.launch });
    const { request } = devServer(docs);
    await request("/docs/");
    expect(fake.launch).toHaveBeenCalledOnce();
    files["docs/one.md"] = `# One\n\nThe first page.\n\n${diagram("Another")}\n`;
    expect((await request("/docs/one/")).body).toContain("<img");
    expect(fake.launch).toHaveBeenCalledOnce();
    // A page per theme, for each of the two drawings.
    expect(fake.pages).toHaveLength(4);
    expect(fake.browser.closed).toBe(0);
    await closeBundle(docs);
    expect(fake.browser.closed).toBe(1);
    await closeBundle(docs);
    expect(fake.browser.closed).toBe(1);
  });

  it("says once, as it starts, when its links name main for want of the commit", async () => {
    const { request, warn } = devServer(plugin({ launch: missingChromium(), ref: null }));
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("name main"));
    expect((await request("/docs/")).body).toContain("/blob/main/docs/README.md");
  });

  it("shows the diagrams' source without Chromium, and says why once", async () => {
    const launch = missingChromium();
    const docs = plugin({ launch });
    const { request, warn } = devServer(docs);
    expect((await request("/docs/one/")).body).toContain('<figure class="undrawn">');
    expect((await request("/docs/one/")).body).toContain('<figure class="undrawn">');
    expect(launch).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("npm run browsers"));
    await expect(closeBundle(docs)).resolves.toBeUndefined();
  });
});
