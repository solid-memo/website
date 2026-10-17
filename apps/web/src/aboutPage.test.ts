// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { siteOrigin } from "@solid-memo/vocab/tooling/siteMap";
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

/**
 * Where a link relative to /about/ is served from: the site's page, a
 * page of the docs (`/docs/` from docs/README.md, `/docs/<page>/` from
 * docs/<page>.md), public/, or the folders the build publishes.
 */
function served(href: string): string {
  const path = new URL(href, "https://site.example/about/").pathname;
  if (path === "/") return resolve(app, "index.html");
  if (path === "/docs/") return resolve(repository, "docs/README.md");
  const page = /^\/docs\/([a-z0-9-]+)\/$/.exec(path);
  if (page) return resolve(repository, "docs", `${page[1]}.md`);
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

  it("is a page of its own for search engines, at its address on the domain in CNAME, which the sitemap lists", () => {
    expect(html.startsWith('<!doctype html>\n<html lang="en">')).toBe(true);
    expect(html.match(/<h1>/g)).toHaveLength(1);
    expect(html).toMatch(/<title>About Solid Memo[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description"\s+content="[^"]+"/);
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    );
    expect(html).not.toContain("noindex");
    // Without a domain there is no sitemap, and no address to name.
    const origin = siteOrigin(resolve(repository, "CNAME"));
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null;
    expect(canonical).toBe(origin === null ? null : `${origin}/about/`);
  });

  it("has a link preview of its own: what it is, at its address, with the site's picture", () => {
    const meta = (key: string) =>
      new RegExp(`<meta (?:property|name)="${key}"\\s+content="([^"]*)"`).exec(html)?.[1] ?? null;
    expect(meta("og:type")).toBe("website");
    expect(meta("og:site_name")).toBe("Solid Memo");
    expect(meta("og:title")).toBe("About Solid Memo");
    expect(meta("og:description")).toBe(meta("description"));
    expect(meta("og:locale")).toBe("en");
    expect(meta("twitter:card")).toBe("summary_large_image");
    const canonical = /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null;
    expect(meta("og:url")).toBe(canonical);
    // The picture is one of the site's own files, at the site's address, at the size it says.
    const image = meta("og:image")!;
    expect(image.startsWith(new URL("/", canonical ?? "https://solid-memo.com/").href)).toBe(true);
    const file = resolve(app, "public", new URL(image).pathname.slice(1));
    expect(existsSync(file)).toBe(true);
    const png = readFileSync(file);
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
      Number(meta("og:image:width")),
      Number(meta("og:image:height")),
    ]);
    expect(meta("og:image:alt")).not.toBe("");
    // The site's page says the same of the picture.
    const site = read("index.html");
    expect(site).toContain(`<meta property="og:image" content="${image}" />`);
    expect(site).toContain(`<meta property="og:image:alt" content="${meta("og:image:alt")}" />`);
  });

  it("shows the app in screenshots, each one of the site's files, described, at the size it says", () => {
    const images = [...html.matchAll(/<img\b([^>]*)>/g)].map(([, attributes]) => {
      const attribute = (name: string) =>
        new RegExp(`\\b${name}="([^"]*)"`).exec(attributes!)?.[1] ?? null;
      return {
        src: attribute("src")!,
        alt: attribute("alt"),
        size: [Number(attribute("width")), Number(attribute("height"))],
      };
    });
    expect(images.map(({ src }) => src)).toEqual(
      ["study", "library", "course-chapter", "statistics", "studio"].map(
        (name) => `../screenshots/${name}.png`,
      ),
    );
    for (const { src, alt, size } of images) {
      expect(alt).toMatch(/\S/);
      const png = readFileSync(served(src));
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(size);
    }
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
    expect(hrefs).toContain("../docs/");
    expect(hrefs).toContain("https://github.com/solid-memo/website/issues");
  });

  it("links only to what is there, its icons included: its own sections, the site's files, the docs' pages, the repository's documents and https pages", () => {
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

  it("is linked from the site's page, for a browser that runs no script, as the docs are", () => {
    const noscript = /<noscript>([\s\S]*)<\/noscript>/.exec(read("index.html"))![1]!;
    expect(noscript).toContain('<a href="about/">');
    expect(noscript).toContain('<a href="docs/">');
  });
});
