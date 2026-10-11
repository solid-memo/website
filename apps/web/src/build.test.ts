// @vitest-environment node
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { build, loadEnv, type Rolldown } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
import { siteConfig, siteHtml } from "./config";

/*
 * The production build itself, as the site ships it (docs/markdown.md):
 * no way for data to become markup, the Studio in a chunk of its own,
 * and a Content Security Policy that lets the page's own scripts run.
 */

/** Ways script can turn a string into markup. */
const HTML_SINKS =
  /\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|createContextualFragment|srcdoc)\b|document\.write/;

let chunks: Rolldown.OutputChunk[];
let assets: Rolldown.OutputAsset[];
let html: string;

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
  const page = result.output.find(
    (item): item is Rolldown.OutputAsset => item.fileName === "index.html",
  )!;
  html = page.source as string;
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

describe("the Studio", () => {
  const isStudio = (id: string) => id.includes("/apps/studio/src/");
  const chunkNamed = (fileName: string) => chunks.find((chunk) => chunk.fileName === fileName)!;
  const studioChunks = () => chunks.filter((chunk) => Object.keys(chunk.modules).some(isStudio));
  /** What the page loads up front: its entry, and what that imports, statically. */
  const upFront = () => {
    const fileNames = new Set<string>();
    const visit = (fileName: string) => {
      if (fileNames.has(fileName)) return;
      fileNames.add(fileName);
      chunkNamed(fileName).imports.forEach(visit);
    };
    visit(chunks.find((chunk) => chunk.isEntry)!.fileName);
    return fileNames;
  };

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

describe("the page's Content Security Policy", () => {
  const policy = () => {
    const meta = /<meta http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
    return new Map(
      meta![1]!.split(";").map((part) => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name!, values];
      }),
    );
  };

  it("comes before any script, so it covers them all", () => {
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("<script"));
  });

  it("lets the site's own scripts run, and each inline one by its hash", () => {
    const allowed = policy().get("script-src")!;
    expect(allowed).toContain("'self'");
    // Every script without a src runs inline, whatever its attributes, but data
    // (a JSON-LD block) is never run.
    const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter(
        ([, attributes]) =>
          !/\bsrc=/.test(attributes!) && !/\btype="application\/ld\+json"/.test(attributes!),
      )
      .map(([, , code]) => `'sha256-${createHash("sha256").update(code!).digest("base64")}'`);
    expect(inline).toHaveLength(1);
    expect(allowed.filter((source) => source.startsWith("'sha256-"))).toEqual(inline);
    for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g))
      expect(src).toMatch(/^\.\/assets\//);
  });

  it("allows no plugins, no base element and no form posts", () => {
    expect(policy().get("object-src")).toEqual(["'none'"]);
    expect(policy().get("base-uri")).toEqual(["'none'"]);
    expect(policy().get("form-action")).toEqual(["'none'"]);
  });
});

describe("the page's structured data", () => {
  type Node = Record<string, unknown>;
  const graph = () => {
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    expect(blocks).toHaveLength(1);
    return (JSON.parse(blocks[0]![1]!) as { "@graph": Node[] })["@graph"];
  };
  const nodeOfType = (type: string) => graph().find((node) => node["@type"] === type)!;

  it("names the app's languages, its license and its source code", () => {
    const app = nodeOfType("WebApplication");
    expect([...(app.inLanguage as string[])].sort()).toEqual(["de", "en", "es", "fr", "ko", "sv"]);
    expect(app.license).toBe("https://spdx.org/licenses/MIT");
    expect(app.sameAs).toEqual(["https://github.com/solid-memo/website"]);
  });

  it("gives the source code its repository, as the app's own node", () => {
    const app = nodeOfType("WebApplication");
    const source = nodeOfType("SoftwareSourceCode");
    expect(source.codeRepository).toBe("https://github.com/solid-memo/website");
    expect(source.license).toBe(app.license);
    expect(source.targetProduct).toEqual({ "@id": app["@id"] });
  });
});

describe("the page's name", () => {
  it("is the site's (VITE_APP_NAME, Solid Memo when unset) in its title, link preview and JSON-LD", () => {
    // The name this build was given, so a fork's own apps/web/.env passes too.
    const { appName } = siteConfig(
      loadEnv("production", resolve(import.meta.dirname, ".."), "VITE_"),
    );
    const inHtml = siteHtml("%APP_NAME%", { appName });
    expect(html).not.toContain("%APP_NAME");
    expect(html).toContain(
      `<title>${inHtml} - Spaced-repetition flashcards in your Solid pod</title>`,
    );
    expect(html).toContain(`<meta property="og:site_name" content="${inHtml}" />`);
    expect(html).toContain(`<meta property="og:title" content="${inHtml}" />`);
    const jsonLd = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const graph = (JSON.parse(jsonLd) as { "@graph": Record<string, unknown>[] })["@graph"];
    expect(graph.map((node) => node.name)).toEqual([appName, appName]);
  });
});
