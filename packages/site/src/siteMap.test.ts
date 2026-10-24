// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPOSITORY_ROOT } from "@solid-memo/vocab/tooling/root";
import { isNoindex, robotsTxt, siteMapPlugin, siteOrigin, sitemapXml } from "./siteMap.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "solid-memo-site-map-"));
});

describe("siteOrigin", () => {
  const origin = async (text: string) => {
    await writeFile(join(dir, "CNAME"), text);
    return siteOrigin(join(dir, "CNAME"));
  };

  it("is https and the domain in CNAME, lowercased, without its line break", async () => {
    expect(await origin("solid-memo.com\n")).toBe("https://solid-memo.com");
    expect(await origin("  Memo.Example.ORG ")).toBe("https://memo.example.org");
    expect(await origin("xn--bcher-kva.example")).toBe("https://xn--bcher-kva.example");
  });

  it("is null when there is no CNAME, or it is empty", async () => {
    expect(siteOrigin(join(dir, "missing"))).toBeNull();
    expect(await origin("")).toBeNull();
    expect(await origin(" \n")).toBeNull();
  });

  it("refuses anything but a bare hostname", async () => {
    for (const text of [
      "https://solid-memo.com",
      "solid-memo.com/docs",
      "solid-memo.com:443",
      "localhost",
      "-bad.example",
      "bad-.example",
      "two.example\nthree.example",
      "example.123",
      "a..example",
    ])
      await expect(origin(text), text).rejects.toThrow(
        `${join(dir, "CNAME")}: "${text}" is not a bare hostname, such as example.org.`,
      );
  });

  it("passes on any other error reading the file", () => {
    expect(() => siteOrigin(dir)).toThrow(/EISDIR/);
  });

  it("reads this repository's CNAME as solid-memo.com", () => {
    expect(siteOrigin(join(REPOSITORY_ROOT, "CNAME"))).toBe("https://solid-memo.com");
  });
});

describe("sitemapXml", () => {
  it("lists each page once, the site's own first and the rest in order, escaped", () => {
    expect(
      sitemapXml("https://example.org", [
        "/docs/b/",
        "/about/",
        "/",
        "/docs/a/",
        "/about/",
        "/a&b/",
      ]),
    ).toBe(
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.org/</loc>
  </url>
  <url>
    <loc>https://example.org/a&amp;b/</loc>
  </url>
  <url>
    <loc>https://example.org/about/</loc>
  </url>
  <url>
    <loc>https://example.org/docs/a/</loc>
  </url>
  <url>
    <loc>https://example.org/docs/b/</loc>
  </url>
</urlset>
`,
    );
  });

  it("escapes every character XML reserves, and lists no page when there is none", () => {
    expect(sitemapXml("https://example.org", [`/<'">/`])).toContain(
      "<loc>https://example.org/&lt;&apos;&quot;&gt;/</loc>",
    );
    expect(sitemapXml("https://example.org", [])).not.toContain("<url>");
  });
});

describe("robotsTxt", () => {
  it("keeps the journeys' report out, and names the sitemap when there is an origin", () => {
    expect(robotsTxt("https://example.org")).toBe(
      "User-agent: *\nAllow: /\nDisallow: /journeys/\n\nSitemap: https://example.org/sitemap.xml\n",
    );
    expect(robotsTxt(null)).toBe("User-agent: *\nAllow: /\nDisallow: /journeys/\n");
  });
});

describe("isNoindex", () => {
  it("is true for a robots meta tag whose content has noindex", () => {
    expect(isNoindex('<meta name="robots" content="noindex" />')).toBe(true);
    expect(isNoindex("<META NAME='Robots' CONTENT='nofollow, NoIndex'>")).toBe(true);
    expect(isNoindex('<meta charset="utf-8"><meta content=noindex name=robots>')).toBe(true);
  });

  it("is false for indexed pages and for the word elsewhere", () => {
    expect(isNoindex('<meta name="robots" content="index, follow" />')).toBe(false);
    expect(isNoindex('<meta name="robots">')).toBe(false);
    expect(isNoindex('<meta name="googlebot" content="noindex">')).toBe(false);
    expect(isNoindex('<meta name="robots" content="noindexing">')).toBe(false);
    expect(isNoindex("<p>noindex</p><meta>")).toBe(false);
  });
});

describe("siteMapPlugin", () => {
  type Bundle = Record<string, { fileName: string; type: "asset" | "chunk"; source?: string }>;

  const indexed = '<!doctype html><meta name="robots" content="index, follow"><h1>Page</h1>';
  const hidden = '<!doctype html><meta name="robots" content="noindex"><h1>Old</h1>';

  async function run(origin: string | null, publicDir: string, bundle: Bundle) {
    const plugin = siteMapPlugin({ origin });
    (plugin.configResolved as (config: { publicDir: string }) => void)({ publicDir });
    const emitFile = vi.fn<(file: { fileName: string; source: string }) => void>();
    await (
      plugin.generateBundle as unknown as (
        this: { emitFile: typeof emitFile },
        options: unknown,
        bundle: Bundle,
      ) => Promise<void>
    ).call({ emitFile }, {}, bundle);
    return Object.fromEntries(emitFile.mock.calls.map(([file]) => [file.fileName, file.source]));
  }

  const bundle: Bundle = {
    "index.html": { fileName: "index.html", type: "asset", source: indexed },
    "docs/srs/index.html": { fileName: "docs/srs/index.html", type: "asset", source: indexed },
    "docs/old/index.html": { fileName: "docs/old/index.html", type: "asset", source: hidden },
    "assets/index.js": { fileName: "assets/index.js", type: "chunk" },
    "docs/srs/notes.html": { fileName: "docs/srs/notes.html", type: "asset", source: indexed },
  };

  it("runs in the build only, after Vite's own plugins", () => {
    const plugin = siteMapPlugin({ origin: null });
    expect(plugin.apply).toBe("build");
    expect(plugin.enforce).toBe("post");
  });

  it("lists the pages of the bundle and the public folder, but not those with noindex", async () => {
    await mkdir(join(dir, "about"));
    await mkdir(join(dir, "studio"));
    await writeFile(join(dir, "about", "index.html"), indexed);
    await writeFile(join(dir, "studio", "index.html"), hidden);
    await writeFile(join(dir, "favicon.svg"), "<svg/>");
    const emitted = await run("https://example.org", dir, bundle);
    expect(Object.keys(emitted)).toEqual(["robots.txt", "sitemap.xml"]);
    expect(emitted["robots.txt"]).toBe(robotsTxt("https://example.org"));
    expect(emitted["sitemap.xml"]).toBe(
      sitemapXml("https://example.org", ["/", "/about/", "/docs/srs/"]),
    );
  });

  it("writes only robots.txt, without a sitemap, when there is no origin", async () => {
    expect(await run(null, dir, bundle)).toEqual({ "robots.txt": robotsTxt(null) });
  });

  it("reads no public folder when there is none, or it is turned off", async () => {
    for (const publicDir of ["", join(dir, "missing")])
      expect((await run("https://example.org", publicDir, bundle))["sitemap.xml"]).toBe(
        sitemapXml("https://example.org", ["/", "/docs/srs/"]),
      );
  });

  it("refuses a sitemap or robots.txt in the public folder, which would replace the one it writes", async () => {
    for (const name of ["sitemap.xml", "robots.txt"]) {
      const folder = await mkdtemp(join(tmpdir(), "solid-memo-site-map-"));
      await writeFile(join(folder, name), "by hand");
      await expect(run("https://example.org", folder, bundle)).rejects.toThrow(
        `${join(folder, name)}: the build writes ${name} from CNAME (docs/deployment.md); delete this copy.`,
      );
    }
  });
});
