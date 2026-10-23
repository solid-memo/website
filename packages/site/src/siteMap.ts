// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdir, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

/**
 * The site's sitemap and robots.txt, written by the build from the
 * domain in the repository's CNAME (docs/deployment.md#custom-domain-optional):
 * every page the build emits or copies is listed, unless it asks not
 * to be indexed, so a new page needs no edit here, and a fork that
 * writes its own domain into CNAME gets its own. With no CNAME there
 * is no sitemap, since its addresses must be absolute.
 */

/** A hostname as CNAME holds it: labels of letters, digits and hyphens, at least two, the last not all digits. */
const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

/** Files the build writes, which a copy in the public folder would replace. */
const WRITTEN = ["sitemap.xml", "robots.txt"];

/**
 * The site's origin (`https://` and the domain, no slash) from the CNAME
 * file at `cnamePath`; null when there is none or it is empty. Anything
 * but a bare hostname (a scheme, a path, a port) fails the build.
 */
export function siteOrigin(cnamePath: string): string | null {
  let text: string;
  try {
    text = readFileSync(cnamePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const host = text.trim().toLowerCase();
  if (host === "") return null;
  if (!HOSTNAME.test(host))
    throw new Error(`${cnamePath}: "${text.trim()}" is not a bare hostname, such as example.org.`);
  return `https://${host}`;
}

function escapeXml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}

/** The sitemap of the pages at `paths` (each starting with `/`) on `origin`: `/` first, the rest sorted. */
export function sitemapXml(origin: string, paths: readonly string[]): string {
  const unique = new Set(paths);
  const rest = [...unique].filter((path) => path !== "/").sort();
  const ordered = unique.has("/") ? ["/", ...rest] : rest;
  const urls = ordered.map(
    (path) => `  <url>\n    <loc>${escapeXml(origin + path)}</loc>\n  </url>\n`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("")}</urlset>\n`;
}

/** robots.txt: everything but the journeys' report's old address (docs/deployment.md#the-journeys-report), and the sitemap when there is one. */
export function robotsTxt(origin: string | null): string {
  const rules = "User-agent: *\nAllow: /\nDisallow: /journeys/\n";
  return origin === null ? rules : `${rules}\nSitemap: ${origin}/sitemap.xml\n`;
}

/** Whether a page asks search engines not to index it, in a `<meta name="robots">`. */
export function isNoindex(html: string): boolean {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attributes = new Map(
      [...tag.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)].map(
        ([, name, ...values]) => [name!.toLowerCase(), values.find((v) => v !== undefined)!],
      ),
    );
    if (
      attributes.get("name")?.toLowerCase() === "robots" &&
      /(^|[\s,])noindex($|[\s,])/i.test(attributes.get("content") ?? "")
    )
      return true;
  }
  return false;
}

/** The address of a page file (`index.html`, `about/index.html`): `/`, `/about/`; null for any other file. */
function pagePath(fileName: string): string | null {
  if (fileName === "index.html") return "/";
  return fileName.endsWith("/index.html") ? `/${fileName.slice(0, -"index.html".length)}` : null;
}

/** Every file under `dir`, as paths relative to it with `/` between folders. */
async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

/**
 * Emits `robots.txt`, and `sitemap.xml` when there is an origin, into
 * the build. It runs after Vite's own plugins (`enforce: "post"`), as
 * the HTML plugin emits the site's `index.html` in its own
 * `generateBundle`; the public folder's pages are read from disk, as
 * Vite copies that folder past the bundle.
 */
export function siteMapPlugin({ origin }: { origin: string | null }): Plugin {
  let publicDir = "";
  return {
    name: "solid-memo:site-map",
    apply: "build",
    enforce: "post",

    configResolved(config) {
      publicDir = config.publicDir;
    },

    async generateBundle(_options, bundle) {
      const pages: { path: string; html: string }[] = [];
      for (const file of Object.values(bundle)) {
        const path = pagePath(file.fileName);
        if (path !== null && file.type === "asset") pages.push({ path, html: String(file.source) });
      }
      for (const fileName of publicDir !== "" && existsSync(publicDir)
        ? await filesUnder(publicDir)
        : []) {
        if (WRITTEN.includes(fileName))
          throw new Error(
            `${join(publicDir, fileName)}: the build writes ${fileName} from CNAME (docs/deployment.md); delete this copy.`,
          );
        const path = pagePath(fileName);
        if (path !== null)
          pages.push({ path, html: await readFile(join(publicDir, fileName), "utf8") });
      }
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robotsTxt(origin) });
      if (origin === null) return;
      const listed = pages.filter((page) => !isNoindex(page.html)).map((page) => page.path);
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemapXml(origin, listed) });
    },
  };
}
