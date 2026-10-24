// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { type Document, Window } from "happy-dom";
import { build, loadEnv, type Rolldown } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
import { PAINTED_ROLES } from "@solid-memo/domain/customPalette";
import { checkSvg, fontNotice } from "@solid-memo/site/diagrams";
import { DOCS_CSP } from "@solid-memo/site/docsSite";
import { diagramMode, FONT_LICENSE_FILE } from "@solid-memo/site/drawDiagrams";
import { appVersion, commitSha } from "@solid-memo/site/siteBuild";
import { siteOrigin } from "@solid-memo/site/siteMap";
import { siteConfig, siteHtml, siteVersion, type SiteConfig } from "./config";

/*
 * The production build itself, as the site ships it (docs/markdown.md):
 * no way for data to become markup, the Studio in a chunk of its own,
 * its messages with it, each language's messages but English's in one of
 * their own, a Content Security Policy that lets the page's own scripts
 * run, and the docs as pages that run none.
 */

/** Ways script can turn a string into markup. */
const HTML_SINKS =
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|createContextualFragment|srcdoc)\b|document\.write/;

/** The settings this build was given, so a fork's own apps/web/.env passes too. */
function builtConfig(): SiteConfig {
  return siteConfig(loadEnv("production", resolve(import.meta.dirname, ".."), "VITE_"));
}

/** The repository's root folder. */
const REPOSITORY = resolve(import.meta.dirname, "../../..");
/** The site's origin, from the domain in CNAME; null without one. */
const origin = siteOrigin(resolve(REPOSITORY, "CNAME"));
/** The docs' sources, the `.md` files in docs/. */
const DOCS_SOURCES = readdirSync(resolve(REPOSITORY, "docs")).filter((name) =>
  name.endsWith(".md"),
);
/** The pages the build makes of them: `docs/index.html` of the README, `docs/<page>/index.html` of the rest. */
const DOCS_PAGES = DOCS_SOURCES.map((name) =>
  name === "README.md" ? "docs/index.html" : `docs/${name.slice(0, -3)}/index.html`,
).sort();

/**
 * The most the page's up-front JavaScript may weigh, gzipped, in kB: what
 * it weighs, with room for a little more. A change that passes it says
 * why the page needs the weight, and raises this in the same commit.
 */
const UP_FRONT_BUDGET_KB = 405;

let chunks: Rolldown.OutputChunk[];
let assets: Rolldown.OutputAsset[];
/** What the build emits, by file name. */
let built: Map<string, string>;
let html: string;
/** The page as a browser reads it, so no regex has to find its tags. */
let dom: Document;
const browser = new Window();

beforeAll(async () => {
  // As `vite build` has it, not as the tests do: the production builds of
  // the dependencies that have a development one too.
  const environment = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  let result: Rolldown.RolldownOutput;
  try {
    result = (await build({
      configFile: resolve(import.meta.dirname, "../vite.config.ts"),
      // The app's own directory, wherever the tests are run from.
      root: resolve(import.meta.dirname, ".."),
      logLevel: "silent",
      build: { write: false },
    })) as Rolldown.RolldownOutput;
  } finally {
    process.env.NODE_ENV = environment;
  }
  chunks = result.output.filter((item): item is Rolldown.OutputChunk => item.type === "chunk");
  assets = result.output.filter((item): item is Rolldown.OutputAsset => item.type === "asset");
  built = new Map(
    result.output.map((item) => [
      item.fileName,
      item.type === "asset" ? String(item.source) : item.code,
    ]),
  );
  const page = result.output.find(
    (item): item is Rolldown.OutputAsset => item.fileName === "index.html",
  )!;
  html = page.source as string;
  dom = new browser.DOMParser().parseFromString(html, "text/html");
}, 120_000);

describe("the bundle", () => {
  it("has no HTML sink but Preact's own, which only a dangerouslySetInnerHTML prop reaches, and nothing passes one", () => {
    const withSinks = chunks.flatMap((chunk) =>
      Object.entries(chunk.modules)
        .filter(([, module]) => module.code !== null && HTML_SINKS.test(module.code))
        .map(([id]) => id.replace(/^.*\/node_modules\//, "")),
    );
    expect(withSinks).toEqual(["preact/dist/preact.mjs"]);
  });

  it("decodes Markdown's character references with a table, not the browser's parser", () => {
    const ids = chunks.flatMap((chunk) => Object.keys(chunk.modules));
    expect(ids).toContainEqual(
      expect.stringMatching(/decode-named-character-reference\/index\.js$/),
    );
    expect(ids).not.toContainEqual(
      expect.stringMatching(/decode-named-character-reference\/index\.dom\.js$/),
    );
  });
});

const chunkNamed = (fileName: string) => chunks.find((chunk) => chunk.fileName === fileName)!;

/** What the page loads up front: its entry, and what that imports, statically. */
function upFront(): Set<string> {
  const fileNames = new Set<string>();
  const visit = (fileName: string) => {
    if (fileNames.has(fileName)) return;
    fileNames.add(fileName);
    chunkNamed(fileName).imports.forEach(visit);
  };
  visit(chunks.find((chunk) => chunk.isEntry)!.fileName);
  return fileNames;
}

/** The Studio's code: anything under apps/studio but its messages in a language other than English. */
const isStudio = (id: string) =>
  id.includes("/apps/studio/src/") && !/\/apps\/studio\/src\/i18n\/(?!en\.)/.test(id);
const studioChunks = () => chunks.filter((chunk) => Object.keys(chunk.modules).some(isStudio));

describe("the Studio", () => {
  it("is a chunk of its own, which the page fetches only when a Studio route opens (docs/studio.md)", () => {
    const studio = studioChunks();
    expect(studio).toHaveLength(1);
    expect(studio[0]!.isDynamicEntry).toBe(true);
    expect(studio[0]!.isEntry).toBe(false);
    expect(upFront().has(studio[0]!.fileName)).toBe(false);
    for (const fileName of upFront())
      expect(Object.keys(chunkNamed(fileName).modules).filter(isStudio)).toEqual([]);
    expect(html).not.toContain(studio[0]!.fileName);
  });

  it("brings its stylesheet (studio.css) with its chunk, never up front", () => {
    const [stylesheet, ...others] = [...studioChunks()[0]!.viteMetadata!.importedCss];
    expect(others).toEqual([]);
    expect(assets.find((asset) => asset.fileName === stylesheet)!.source).toContain(
      ":root[data-surface=studio]",
    );
    for (const fileName of upFront())
      expect([...chunkNamed(fileName).viteMetadata!.importedCss]).not.toContain(stylesheet);
    expect(html).not.toContain(stylesheet);
  });
});

describe("the messages", () => {
  /** The languages of the catalogs under `folder` (packages/ui, apps/studio) that a chunk holds. */
  const catalogsIn = (folder: string, chunk: Rolldown.OutputChunk) =>
    Object.keys(chunk.modules).flatMap(
      (id) => new RegExp(`/${folder}/src/i18n/(\\w+)\\.json$`).exec(id)?.[1] ?? [],
    );

  /** Each chunk holding a catalog under `folder` in a language other than English, by its language. */
  function otherLanguages(folder: string) {
    const others = chunks.filter((chunk) =>
      catalogsIn(folder, chunk).some((locale) => locale !== "en"),
    );
    for (const chunk of others) {
      expect(chunk.isDynamicEntry).toBe(true);
      expect(upFront().has(chunk.fileName)).toBe(false);
      expect(html).not.toContain(chunk.fileName);
    }
    return others.map((chunk) => catalogsIn(folder, chunk)).sort();
  }

  it("come up front in English alone, each other language a chunk of its own, fetched when spoken (docs/i18n.md)", () => {
    expect(
      [...upFront()].flatMap((fileName) => catalogsIn("packages/ui", chunkNamed(fileName))),
    ).toEqual(["en"]);
    expect(otherLanguages("packages/ui")).toEqual([["de"], ["es"], ["fr"], ["ko"], ["sv"]]);
  });

  it("of the Studio come with its chunk in English, each other language a chunk of its own (docs/studio.md)", () => {
    for (const fileName of upFront())
      expect(catalogsIn("apps/studio", chunkNamed(fileName))).toEqual([]);
    const withEnglish = chunks.filter((chunk) => catalogsIn("apps/studio", chunk).includes("en"));
    expect(withEnglish).toEqual(studioChunks());
    expect(otherLanguages("apps/studio")).toEqual([["de"], ["es"], ["fr"], ["ko"], ["sv"]]);
  });
});

describe("what the page loads up front", () => {
  it(`is at most ${UP_FRONT_BUDGET_KB} kB of JavaScript gzipped, the largest modules named when it is more`, () => {
    const upFrontChunks = [...upFront()].map(chunkNamed);
    const gzipped = upFrontChunks.reduce((sum, chunk) => sum + gzipSync(chunk.code).length, 0);
    const largest = upFrontChunks
      .flatMap((chunk) => Object.entries(chunk.modules))
      .sort(([, a], [, b]) => b.renderedLength - a.renderedLength)
      .slice(0, 15)
      .map(
        ([id, module]) =>
          `${(module.renderedLength / 1024).toFixed(1)} kB ${id.replace(/^.*\/node_modules\//, "").replace(REPOSITORY, "")}`,
      );
    expect(
      gzipped / 1024,
      `${(gzipped / 1024).toFixed(1)} kB gzipped up front; its largest modules, before minifying:\n${largest.join("\n")}`,
    ).toBeLessThanOrEqual(UP_FRONT_BUDGET_KB);
  });
});

describe("the page's Content Security Policy", () => {
  const policy = () => {
    const meta = dom.querySelector('meta[http-equiv="Content-Security-Policy"]')!;
    return new Map(
      meta
        .getAttribute("content")!
        .split(";")
        .map((part) => {
          const [name, ...values] = part.trim().split(/\s+/);
          return [name!, values];
        }),
    );
  };

  it("comes before any script, so it covers them all", () => {
    const meta = dom.querySelector('meta[http-equiv="Content-Security-Policy"]')!;
    expect(dom.scripts.length).toBeGreaterThan(0);
    for (const script of dom.scripts)
      expect(
        meta.compareDocumentPosition(script) & browser.Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
  });

  it("lets the site's own scripts run, and each inline one by its hash", () => {
    const allowed = policy().get("script-src")!;
    expect(allowed).toContain("'self'");
    // Every script without a src runs inline, whatever its attributes, but data
    // (a JSON-LD block) is never run.
    const scripts = [...dom.scripts];
    const inline = scripts
      .filter((script) => !script.hasAttribute("src") && script.type !== "application/ld+json")
      .map((script) => `'sha256-${createHash("sha256").update(script.text).digest("base64")}'`);
    expect(inline).toHaveLength(1);
    expect(allowed.filter((source) => source.startsWith("'sha256-"))).toEqual(inline);
    for (const script of scripts.filter((script) => script.hasAttribute("src")))
      expect(script.getAttribute("src")).toMatch(/^\.\/assets\//);
  });

  it("allows no plugins, no base element and no form posts", () => {
    expect(policy().get("object-src")).toEqual(["'none'"]);
    expect(policy().get("base-uri")).toEqual(["'none'"]);
    expect(policy().get("form-action")).toEqual(["'none'"]);
  });
});

/*
 * The script that sets the device's choices on the root before the first
 * paint (docs/theme.md), as the built page has it, run with what the
 * device keeps and the browser's wish for a dark page.
 */
function firstPaint(kept: Record<string, string>, { dark = false, blocked = false } = {}) {
  const script = [...dom.scripts].find(
    (element) => !element.hasAttribute("src") && element.type !== "application/ld+json",
  )!;
  const style: Record<string, string> = {};
  const root = {
    dataset: {} as Record<string, string>,
    style: {
      setProperty(name: string, value: string) {
        style[name] = value;
      },
    },
  };
  const localStorage = {
    getItem(key: string) {
      if (blocked) throw new Error("blocked");
      return kept[key] ?? null;
    },
  };
  new Function("document", "localStorage", "matchMedia", script.text)(
    { documentElement: root },
    localStorage,
    () => ({ matches: dark }),
  );
  return Object.keys(style).length === 0 ? root.dataset : { ...root.dataset, style };
}

describe("the page's first-paint script", () => {
  it("sets the theme kept on the device, else the browser's", () => {
    expect(firstPaint({ "solid-memo:theme": "dark" })).toEqual({ theme: "dark" });
    expect(firstPaint({ "solid-memo:theme": "sepia" }, { dark: true })).toEqual({ theme: "dark" });
    expect(firstPaint({}, { blocked: true })).toEqual({ theme: "light" });
  });

  it("sets the palette and the text size kept on the device, if each is in the form one takes", () => {
    expect(
      firstPaint({ "solid-memo:palette": "high-contrast", "solid-memo:textSize": "larger" }),
    ).toEqual({ theme: "light", palette: "high-contrast", textSize: "larger" });
    // A palette or size the app has yet to have is set all the same: the stylesheet shows it as the default.
    expect(firstPaint({ "solid-memo:palette": "x".repeat(32) })).toEqual({
      theme: "light",
      palette: "x".repeat(32),
    });
    for (const value of ["", "Larger", "x".repeat(33), 'large" onload="x', "1x"])
      expect(firstPaint({ "solid-memo:palette": value, "solid-memo:textSize": value })).toEqual({
        theme: "light",
      });
  });
});

describe("the first paint of a palette of the user's own", () => {
  function painted(kept: unknown, dark = false) {
    return firstPaint(
      { "solid-memo:palette": "parchment", "solid-memo:palette-colors": JSON.stringify(kept) },
      { dark },
    );
  }

  it("sets the colors kept for the theme shown on the root", () => {
    const kept = { light: { "--text": "#2B2118" }, dark: { "--text": "#ffffff" } };
    expect(painted(kept)).toEqual({
      theme: "light",
      palette: "parchment",
      style: { "--text": "#2B2118" },
    });
    expect(painted(kept, true)).toMatchObject({ theme: "dark", style: { "--text": "#ffffff" } });
  });

  it("sets each role a palette may paint, and no other", () => {
    const light = Object.fromEntries(PAINTED_ROLES.map((role) => [role, "#123456"]));
    expect(painted({ light })).toMatchObject({ style: light });
    expect(
      painted({
        light: {
          "--masthead-bg": "#000000",
          "--text;x": "#000000",
          "--Text": "#000000",
          "-text": "#000000",
          "--grade-6": "#000000",
        },
      }),
    ).toEqual({ theme: "light", palette: "parchment" });
  });

  it("sets nothing that is not #rrggbb", () => {
    for (const color of [
      "red",
      "#fff",
      "#ffffff80",
      "var(--bg)",
      "#ffffff; background: url(https://evil.example/x)",
      ["#ffffff"],
      16777215,
    ])
      expect(painted({ light: { "--bg": color } }), JSON.stringify(color)).toEqual({
        theme: "light",
        palette: "parchment",
      });
  });

  it("paints nothing when what is kept is no palette's colors", () => {
    for (const text of ["not json", "null", "[]", '"#ffffff"'])
      expect(firstPaint({ "solid-memo:palette-colors": text }), text).toEqual({ theme: "light" });
    expect(firstPaint({})).toEqual({ theme: "light" });
  });
});

describe("the page's structured data", () => {
  type Node = Record<string, unknown>;
  const graph = () => {
    const blocks = dom.querySelectorAll('script[type="application/ld+json"]');
    expect(blocks).toHaveLength(1);
    return (JSON.parse(blocks[0]!.textContent) as { "@graph": Node[] })["@graph"];
  };
  const nodeOfType = (type: string) => graph().find((node) => node["@type"] === type)!;

  it("names the app's languages, its license and its source code", () => {
    const app = nodeOfType("WebApplication");
    expect([...(app.inLanguage as string[])].sort()).toEqual(["de", "en", "es", "fr", "ko", "sv"]);
    expect(app.license).toBe("https://spdx.org/licenses/MIT");
    expect(app.sameAs).toEqual([builtConfig().repoUrl]);
  });

  it("gives the source code its repository, as the app's own node", () => {
    const app = nodeOfType("WebApplication");
    const source = nodeOfType("SoftwareSourceCode");
    expect(source.codeRepository).toBe(builtConfig().repoUrl);
    expect(source.license).toBe(app.license);
    expect(source.targetProduct).toEqual({ "@id": app["@id"] });
  });
});

describe("the page's name", () => {
  it("is the site's (VITE_APP_NAME, Solid Memo when unset) in its title, link preview and JSON-LD", () => {
    const config = builtConfig();
    const { appName } = config;
    const inHtml = siteHtml("%APP_NAME%", { ...config, version: appVersion() });
    expect(html).not.toContain("%APP_NAME");
    expect(html).toContain(
      `<title>${inHtml} - Spaced-repetition flashcards in your Solid pod</title>`,
    );
    expect(html).toContain(`<meta property="og:site_name" content="${inHtml}" />`);
    expect(html).toContain(`<meta property="og:title" content="${inHtml}" />`);
    const jsonLd = dom.querySelector('script[type="application/ld+json"]')!.textContent;
    const graph = (JSON.parse(jsonLd) as { "@graph": Record<string, unknown>[] })["@graph"];
    expect(graph.map((node) => node.name)).toEqual([appName, appName]);
  });
});

describe("the page's repository", () => {
  it("is the site's (VITE_REPO_URL, Solid Memo's when unset) in its noscript link", () => {
    expect(html).not.toContain("%REPO_URL");
    expect(html).toContain(
      `<a href="${siteHtml("%REPO_URL%", { ...builtConfig(), version: appVersion() })}">source code</a>`,
    );
  });
});

describe("the page's version", () => {
  it("is the root package.json's, in a meta element the page reads", () => {
    expect(html).not.toContain("%APP_VERSION");
    expect(siteVersion(dom)).toBe(appVersion());
  });
});

describe("robots.txt and the sitemap", () => {
  const emitted = (fileName: string) =>
    assets.find((asset) => asset.fileName === fileName)?.source as string | undefined;
  const locs = () =>
    [
      ...new browser.DOMParser()
        .parseFromString(emitted("sitemap.xml")!, "text/xml")
        .querySelectorAll("loc"),
    ].map((loc) => loc.textContent);

  it("are written from CNAME, robots.txt naming the sitemap when there is a domain", () => {
    const robots = emitted("robots.txt")!;
    expect(robots).toContain("Disallow: /journeys/");
    if (origin === null) {
      expect(robots).not.toContain("Sitemap:");
      expect(emitted("sitemap.xml")).toBeUndefined();
    } else expect(robots).toContain(`\nSitemap: ${origin}/sitemap.xml\n`);
  });

  it.runIf(origin !== null)(
    "lists the site's page, which the HTML plugin emits, first, the About page and every page of the docs",
    () => {
      const docs = DOCS_PAGES.map(
        (fileName) => `${origin}/${fileName.slice(0, -"index.html".length)}`,
      );
      expect(locs()).toEqual([`${origin}/`, ...[`${origin}/about/`, ...docs].sort()]);
      expect(dom.querySelector('link[rel="canonical"]')!.getAttribute("href")).toBe(locs()[0]);
    },
  );

  it.runIf(origin !== null)("lists no page that asks not to be indexed", () => {
    const app = resolve(import.meta.dirname, "..");
    for (const loc of locs()) {
      const path = new URL(loc).pathname;
      const fileName = `${path.slice(1)}index.html`;
      const page = built.get(fileName) ?? readFileSync(resolve(app, "public", fileName), "utf8");
      const robots = new browser.DOMParser()
        .parseFromString(page, "text/html")
        .querySelector('meta[name="robots"]');
      expect(robots?.getAttribute("content") ?? "", loc).not.toContain("noindex");
    }
  });
});

describe("the docs", () => {
  /** A made-up origin the pages' relative addresses are resolved on. */
  const SITE = "https://site.invalid/";
  /** The commit the pages' links into the repository name, as the build has it. */
  const ref = commitSha() ?? "main";
  const parsed = new Map<string, Document>();
  /** An built page as a browser reads it. */
  const page = (fileName: string) => {
    if (!parsed.has(fileName))
      parsed.set(
        fileName,
        new browser.DOMParser().parseFromString(built.get(fileName)!, "text/html"),
      );
    return parsed.get(fileName)!;
  };
  const docsFiles = () => [...built.keys()].filter((fileName) => fileName.startsWith("docs/"));
  /** Every address a page names, with the element that names it. */
  const addresses = (fileName: string) =>
    [...page(fileName).querySelectorAll("[href], [src], [srcset]")].flatMap((element) =>
      ["href", "src", "srcset"]
        .filter((name) => element.hasAttribute(name))
        .map((name) => ({ element, address: element.getAttribute(name)! })),
    );
  /** Whether the site serves a file: one the build emits, or one Vite copies from public/. */
  const served = (fileName: string) =>
    built.has(fileName) || existsSync(resolve(import.meta.dirname, "../public", fileName));
  /** The file an address on the site leads to, from its path. */
  const fileOf = (url: URL) => {
    const path = decodeURIComponent(url.pathname.slice(1));
    return path === "" || path.endsWith("/") ? `${path}index.html` : path;
  };
  const SVG = /^docs\/diagrams\/[a-z0-9-]+-[0-9a-f]{8}(\.dark)?\.svg$/;
  /** Whether the diagrams were drawn: always, but under DOCS_DIAGRAMS=skip, which draws none. */
  const drawn = () => docsFiles().some((fileName) => fileName.endsWith(".svg"));
  /** The Mermaid blocks of the docs' sources, each of which is a figure. */
  const fences = () =>
    DOCS_SOURCES.flatMap(
      (name) =>
        readFileSync(resolve(REPOSITORY, "docs", name), "utf8").match(
          /^ {0,3}(`{3,}|~{3,})mermaid\s*$/gm,
        ) ?? [],
    ).length;

  it("are a page for each of docs/*.md and one stylesheet", () => {
    expect(
      docsFiles()
        .filter((fileName) => fileName.endsWith(".html"))
        .sort(),
    ).toEqual([...DOCS_PAGES].sort());
    expect(built.has("docs/docs.css")).toBe(true);
  });

  it("each open with their policy, run no script and name themselves, with ids of their own", () => {
    for (const fileName of DOCS_PAGES) {
      const doc = page(fileName);
      expect(built.get(fileName)!.startsWith("<!doctype html>\n"), fileName).toBe(true);
      expect(doc.documentElement.getAttribute("lang"), fileName).toBe("en");
      const policy = doc.querySelector('meta[http-equiv="Content-Security-Policy"]')!;
      expect(policy.getAttribute("content"), fileName).toBe(DOCS_CSP);
      for (const element of doc.querySelectorAll("link, style, img, source, script"))
        expect(
          policy.compareDocumentPosition(element) & browser.Node.DOCUMENT_POSITION_FOLLOWING,
          fileName,
        ).toBeTruthy();
      expect(doc.querySelectorAll("script, style, [style]"), fileName).toHaveLength(0);
      for (const element of doc.querySelectorAll("*"))
        for (const name of element.getAttributeNames())
          expect(name.startsWith("on"), `${fileName}: ${name}`).toBe(false);
      expect(doc.querySelectorAll("h1"), fileName).toHaveLength(1);
      expect(doc.title, fileName).toMatch(/\S - Solid Memo docs$/);
      expect(
        doc.querySelector('meta[name="description"]')!.getAttribute("content"),
        fileName,
      ).toMatch(/\S/);
      const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
      expect(canonical, fileName).toBe(
        origin === null ? undefined : `${origin}/${fileName.slice(0, -"index.html".length)}`,
      );
      const ids = [...doc.querySelectorAll("[id]")].map((element) => element.id);
      expect(new Set(ids).size, fileName).toBe(ids.length);
    }
  });

  it("link docs.css as their one stylesheet", () => {
    for (const fileName of DOCS_PAGES) {
      const sheets = [...page(fileName).querySelectorAll('link[rel="stylesheet"]')];
      expect(sheets, fileName).toHaveLength(1);
      expect(fileOf(new URL(sheets[0]!.getAttribute("href")!, SITE + fileName))).toBe(
        "docs/docs.css",
      );
    }
  });

  it("name every address on the site relatively, and no Markdown file", () => {
    for (const fileName of DOCS_PAGES)
      for (const { address } of addresses(fileName)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(address)) continue;
        expect(address, fileName).not.toMatch(/^\//);
        expect(address.split("#")[0], fileName).not.toMatch(/\.md$/);
      }
  });

  it("lead every link somewhere: a heading, a page, a file of the site, the repository at the commit, or the web", () => {
    const { repoUrl } = builtConfig();
    /** A file or folder of the repository at the commit: its kind and its path. */
    const inRepository = (address: string) => {
      for (const kind of ["blob", "tree"] as const) {
        const prefix = `${repoUrl}/${kind}/${ref}/`;
        if (address.startsWith(prefix))
          return { kind, path: decodeURIComponent(address.slice(prefix.length).split("#")[0]!) };
      }
      return null;
    };
    const counts = { site: 0, repository: 0, web: 0 };
    for (const fileName of DOCS_PAGES)
      for (const { element, address } of addresses(fileName)) {
        if (element.tagName !== "A" && element.tagName !== "LINK") continue;
        const url = new URL(address, SITE + fileName);
        const where = `${fileName}: ${address}`;
        if (url.origin === new URL(SITE).origin) {
          counts.site++;
          const target = fileOf(url);
          expect(served(target), where).toBe(true);
          if (url.hash !== "")
            expect(
              page(target).getElementById(decodeURIComponent(url.hash.slice(1))),
              where,
            ).not.toBeNull();
          continue;
        }
        const file = inRepository(address);
        if (file !== null) {
          counts.repository++;
          const found = statSync(resolve(REPOSITORY, file.path), { throwIfNoEntry: false });
          expect(file.kind === "tree" ? found?.isDirectory() : found?.isFile(), where).toBe(true);
          continue;
        }
        counts.web++;
        expect(url.protocol, where).toMatch(/^https?:$/);
      }
    // Each kind is there, so none is skipped by mistake.
    expect(
      Object.values(counts).every((count) => count > 0),
      JSON.stringify(counts),
    ).toBe(true);
  });

  it.runIf(origin !== null)(
    "are where publiccode.yml's documentation points: every address it names on the site's domain is a page the build serves",
    () => {
      const metadata = readFileSync(resolve(REPOSITORY, "publiccode.yml"), "utf8");
      const onSite = (metadata.match(/https:\/\/[^\s"'#]+/g) ?? []).filter((address) =>
        address.startsWith(`${origin}/`),
      );
      for (const address of onSite) expect(served(fileOf(new URL(address))), address).toBe(true);
      // Its documentation, on this domain, is a page of the docs.
      const documentation = /^ +documentation: (\S+)$/m.exec(metadata)?.[1] ?? "";
      if (onSite.includes(documentation)) expect(fileOf(new URL(documentation))).toMatch(/^docs\//);
    },
  );

  it("show each diagram as a figure, drawn light and dark, the drawings safe to serve and carrying the font's notice", () => {
    const figures = DOCS_PAGES.flatMap((fileName) =>
      [...page(fileName).querySelectorAll("figure")].map((figure) => ({ fileName, figure })),
    );
    expect(figures).toHaveLength(fences());
    expect(drawn()).toBe(diagramMode(process.env) === "required");
    if (!drawn()) {
      for (const { fileName, figure } of figures) {
        expect(figure.className, fileName).toBe("undrawn");
        expect(figure.querySelector("details[open] pre"), fileName).not.toBeNull();
      }
      expect(docsFiles().filter((fileName) => fileName.startsWith("docs/diagrams/"))).toEqual([]);
      return;
    }
    const license = readFileSync(FONT_LICENSE_FILE, "utf8");
    const notice = fontNotice(license);
    for (const { fileName, figure } of figures) {
      const dark = figure.querySelector('picture > source[media="(prefers-color-scheme: dark)"]');
      const img = figure.querySelector("picture > img");
      const light = fileOf(new URL(img!.getAttribute("src")!, SITE + fileName));
      expect(fileOf(new URL(dark!.getAttribute("srcset")!, SITE + fileName)), fileName).toBe(
        light.replace(/\.svg$/, ".dark.svg"),
      );
      expect(img!.getAttribute("alt"), fileName).toMatch(/\S/);
      expect(Number(img!.getAttribute("width")), fileName).toBeGreaterThan(0);
      expect(Number(img!.getAttribute("height")), fileName).toBeGreaterThan(0);
      expect(figure.querySelector("figcaption")!.textContent, fileName).toMatch(/\S/);
    }
    for (const fileName of DOCS_PAGES)
      for (const { element, address } of addresses(fileName)) {
        if (element.tagName !== "IMG" && element.tagName !== "SOURCE") continue;
        const svg = fileOf(new URL(address, SITE + fileName));
        expect(svg, fileName).toMatch(SVG);
        expect(checkSvg(built.get(svg)!), svg).toBeNull();
        expect(built.get(svg)!, svg).toContain(notice);
      }
    // The font's license, beside the drawings, as the package has it (docs/markdown.md#the-diagrams-font).
    expect(built.get("docs/diagrams/OFL-Fredoka.txt")).toBe(license);
  });
});
