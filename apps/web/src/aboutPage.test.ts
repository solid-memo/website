// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The About page, /about/ (public/about/index.html): plain HTML, copied
 * as it is, that says what Solid Memo is to readers and search engines
 * without script. The build test does not see it, so its policy and its
 * links are checked here.
 */

const app = resolve(import.meta.dirname, "..");
const repository = resolve(app, "../..");
const read = (path: string) => readFileSync(resolve(app, path), "utf8");
const html = read("public/about/index.html");

const hrefs = [...html.matchAll(/<(?:a|link)\b[^>]*\bhref="([^"]*)"/g)].map(([, href]) => href!);

/** Where a link relative to /about/ is served from: the site's page, public/, or the folders the build publishes. */
function served(href: string): string {
  const path = new URL(href, "https://site.example/about/").pathname;
  if (path === "/") return resolve(app, "index.html");
  for (const folder of ["ns", "decks"])
    if (path.startsWith(`/${folder}/`)) return resolve(repository, path.slice(1));
  return resolve(app, "public", path.slice(1));
}

describe("the About page", () => {
  it("runs no script, loads nothing from elsewhere and posts no form", () => {
    const meta = /<meta http-equiv="Content-Security-Policy"\s+content="([^"]*)"/.exec(html)!;
    const policy = new Map(
      meta[1]!.split(";").map((part) => {
        const [name, ...values] = part.trim().split(/\s+/);
        return [name!, values];
      }),
    );
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(
      html.search(/<(?:style|link|title)\b/),
    );
    expect(policy.get("default-src")).toEqual(["'none'"]);
    expect(policy.get("script-src")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'none'"]);
    expect(html).not.toMatch(/<script\b/);
    expect(html).not.toMatch(/\son[a-z]+=/);
  });

  it("is a page of its own for search engines, with the address the sitemap lists", () => {
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toMatch(/<title>About Solid Memo[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description"\s+content="[^"]+"/);
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    );
    expect(html).not.toContain("noindex");
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)![1]!;
    expect(read("public/sitemap.xml")).toContain(`<loc>${canonical}</loc>`);
  });

  it("speaks to learners, deck authors, technologists and decision makers", () => {
    for (const id of ["learners", "authors", "technologists", "decision-makers"]) {
      expect(html).toContain(`<section id="${id}"`);
      expect(hrefs).toContain(`#${id}`);
    }
  });

  it("links to the app, its source code, its docs and its issue tracker", () => {
    expect(hrefs).toContain("../");
    expect(hrefs).toContain("https://github.com/solid-memo/website");
    expect(hrefs).toContain("https://github.com/solid-memo/website/blob/main/docs/README.md");
    expect(hrefs).toContain("https://github.com/solid-memo/website/issues");
  });

  it("links only to what is there, its icons included: its own sections, the site's files, the repository's documents and https pages", () => {
    const ids = [...html.matchAll(/\bid="([^"]*)"/g)].map(([, id]) => id!);
    expect(new Set(ids).size).toBe(ids.length);
    for (const href of hrefs) {
      if (href.startsWith("#")) expect(ids).toContain(href.slice(1));
      else if (href.startsWith("https://github.com/solid-memo/website/blob/main/"))
        expect(
          existsSync(
            resolve(
              repository,
              href.slice("https://github.com/solid-memo/website/blob/main/".length),
            ),
          ),
        ).toBe(true);
      else if (href.startsWith("https://")) expect(URL.canParse(href)).toBe(true);
      else expect(existsSync(served(href))).toBe(true);
    }
  });

  it("is linked from the site's page, for a browser that runs no script", () => {
    expect(read("index.html")).toMatch(/<noscript>[\s\S]*<a href="about\/">[\s\S]*<\/noscript>/);
  });
});
