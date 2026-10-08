// @vitest-environment node
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { build, type Rolldown } from "vite";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * The production build itself, as the site ships it (docs/markdown.md):
 * no way for data to become markup, and a Content Security Policy that
 * lets the page's own scripts run.
 */

/** Ways script can turn a string into markup. */
const HTML_SINKS = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|dangerouslySetInnerHTML|createContextualFragment|srcdoc)\b|document\.write/;

let chunks: Rolldown.OutputChunk[];
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
  const page = result.output.find((item): item is Rolldown.OutputAsset => item.fileName === "index.html")!;
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
    expect(ids).toContainEqual(expect.stringMatching(/decode-named-character-reference\/index\.js$/));
    expect(ids).not.toContainEqual(expect.stringMatching(/decode-named-character-reference\/index\.dom\.js$/));
  });
});

describe("the page's Content Security Policy", () => {
  const policy = () => {
    const meta = /<meta http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html);
    return new Map(meta![1]!.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name!, values];
    }));
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
      .filter(([, attributes]) => !/\bsrc=/.test(attributes!) && !/\btype="application\/ld\+json"/.test(attributes!))
      .map(([, , code]) => `'sha256-${createHash("sha256").update(code!).digest("base64")}'`);
    expect(inline).toHaveLength(1);
    expect(allowed.filter((source) => source.startsWith("'sha256-"))).toEqual(inline);
    for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="([^"]*)"/g)) expect(src).toMatch(/^\.\/assets\//);
  });

  it("allows no plugins, no base element and no form posts", () => {
    expect(policy().get("object-src")).toEqual(["'none'"]);
    expect(policy().get("base-uri")).toEqual(["'none'"]);
    expect(policy().get("form-action")).toEqual(["'none'"]);
  });
});
