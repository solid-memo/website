// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { docsSitePlugin } from "@solid-memo/site/publishDocs";
import { turtleDirectoryPlugin } from "@solid-memo/site/publishTurtle";
import { DECKS_ROOT, NS_ROOT, REPOSITORY_ROOT, VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { appVersion, commitSha, siteDefines } from "@solid-memo/site/siteBuild";
import { clientIdPlugin } from "@solid-memo/site/clientId";
import { siteMapPlugin, siteOrigin } from "@solid-memo/site/siteMap";
import { siteConfig, siteHtml, type SiteConfig } from "./src/config.ts";

/**
 * The settings the page reads (docs/configuration.md), checked as the
 * build starts, so a wrong one fails the build rather than the page;
 * and the site's name and version, put in the page's HTML. The docs'
 * plugin reads them too, through `api`.
 */
function siteSettings(): Plugin<{ settings(): SiteConfig }> {
  let settings: SiteConfig;
  return {
    name: "solid-memo:site-settings",
    api: { settings: () => settings },
    configResolved(config) {
      settings = siteConfig(config.env);
    },
    transformIndexHtml(html) {
      return siteHtml(html, { ...settings, version: appVersion() });
    },
  };
}

const settings = siteSettings();
/** The site's origin, from the domain in CNAME (docs/deployment.md#custom-domain-optional); null without one. */
const origin = siteOrigin(`${REPOSITORY_ROOT}CNAME`);

export default defineConfig({
  define: siteDefines({ origin }),
  base: "./",
  plugins: [
    settings,
    preact(),
    // Published with the site: the vocabulary and the shapes (ns/) and the deck
    // library (decks/), at their IRIs, and the vendored profiles. A checkout
    // without decks/ builds without the library; the deploy checks it is there.
    turtleDirectoryPlugin({ dir: NS_ROOT, publicPath: "ns" }),
    ...(existsSync(DECKS_ROOT)
      ? [turtleDirectoryPlugin({ dir: DECKS_ROOT, publicPath: "decks" })]
      : []),
    turtleDirectoryPlugin({ dir: `${VOCAB_ROOT}vendor`, publicPath: "vendor" }),
    // The docs (docs/), rendered to pages at docs/ with their diagrams drawn
    // in Chromium (docs/markdown.md#the-docs-as-a-site): their links into
    // the repository lead to VITE_REPO_URL at the commit being built.
    docsSitePlugin({
      repoUrl: () => settings.api!.settings().repoUrl,
      ref: commitSha(),
      version: appVersion(),
      origin,
    }),
    // robots.txt, and the sitemap of every page, the docs' included, on the
    // domain in CNAME (docs/deployment.md#custom-domain-optional): none
    // without one.
    siteMapPlugin({ origin }),
    // The Client ID Document the app logs in with on that domain
    // (docs/authentication.md#the-client-id-document), under the site's name.
    clientIdPlugin({ origin, name: () => settings.api!.settings().appName }),
  ],
  resolve: {
    alias: {
      react: "preact/compat",
      "react-dom": "preact/compat",
      // The Markdown parser's entity decoder has a browser build that decodes
      // by writing to an element's innerHTML. Its plain one, a lookup table,
      // keeps the bundle free of HTML sinks (docs/markdown.md, src/build.test.ts).
      "decode-named-character-reference": createRequire(import.meta.url).resolve(
        "decode-named-character-reference",
      ),
    },
  },
});
