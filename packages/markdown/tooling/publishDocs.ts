// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Plugin } from "vite";
import { type DocsIo, DocsSiteError, renderDocsSite, repositoryIo } from "./docsSite.ts";
import {
  CACHE_DIR,
  type DrawingBrowser,
  diagramMode,
  drawDiagrams,
  drawInputs,
  type Launch,
  launchChromium,
} from "./drawDiagrams.ts";

/**
 * Publishing the docs with the site (docs/markdown.md, The docs as a
 * site): every page of docs/ rendered to HTML at `docs/`, with its
 * diagrams drawn, as the build's own files; and in dev, rendered anew on
 * each request, so an edit shows on reload. The settings it takes are
 * the site's (apps/web/vite.config.ts): the plugin reads none itself, so
 * the package needs nothing of the app's.
 */

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
};

/** What a build says when it does not know its commit. */
const UNKNOWN_REF =
  "The commit being built is not known (no git checkout, no GITHUB_SHA), so the docs' links into the repository name main, which may have moved on since.";

export type DocsSitePluginOptions = {
  /**
   * The repository's web address, which links out of docs/ lead into
   * (VITE_REPO_URL): asked for when the pages are rendered, as the
   * site's settings are checked once its config is resolved.
   */
  repoUrl: () => string;
  /** The commit those links name; null when it is not known, and they name `main`, with a warning. */
  ref: string | null;
  /** The app's version. */
  version: string;
  /** The site's origin, for the pages' canonical addresses; null for none. */
  origin: string | null;
  /** The repository, read from disk unless a test says otherwise. */
  io?: DocsIo;
  /** The environment, whose DOCS_DIAGRAMS says how a build draws. */
  env?: Record<string, string | undefined>;
  /** Starts the browser that draws: Chromium unless a test says otherwise. */
  launch?: Launch;
  /** Where drawings are kept between builds. */
  cacheDir?: string;
};

export function docsSitePlugin(options: DocsSitePluginOptions): Plugin {
  const {
    io = repositoryIo(),
    env = process.env,
    launch = launchChromium,
    cacheDir = CACHE_DIR,
  } = options;
  const site = () => ({
    ...options,
    repoUrl: options.repoUrl(),
    ref: options.ref ?? "main",
    io,
    mode: "live" as const,
  });
  /** The dev server's browser, started on its first drawing and kept until it closes. */
  let browser: Promise<DrawingBrowser> | undefined;

  return {
    name: "solid-memo:publish-docs",

    configureServer(server) {
      if (options.ref === null) server.config.logger.warn(UNKNOWN_REF);
      let warned = false;
      // One browser for every request: drawDiagrams closes it after each
      // drawing, so it is handed a view of it that stays open.
      const shared: Launch = async () => {
        browser ??= launch();
        const started = await browser;
        return { newPage: () => started.newPage(), close: async () => {} };
      };
      const render = async () => {
        const inputs = await drawInputs();
        return renderDocsSite({
          ...site(),
          inputs,
          // Without Chromium, the pages show each diagram's source and say
          // it was not drawn, and the dev server says why, once.
          draw: (diagrams) =>
            drawDiagrams(diagrams, {
              inputs,
              cacheDir,
              mode: "optional",
              launch: shared,
              warn: (message) => {
                if (!warned) server.config.logger.warn(message);
                warned = true;
              },
            }),
        });
      };
      /** The last pages rendered, which a page's stylesheet and drawings come from. */
      let last: Map<string, string> | undefined;
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? "").split("?")[0]!;
        if (path === "/docs") {
          res.statusCode = 302;
          res.setHeader("Location", "/docs/");
          res.end();
          return;
        }
        if (!path.startsWith("/docs/")) return next();
        const name = path.slice("/docs/".length);
        const page = name === "" || name.endsWith("/");
        try {
          const files = page || last === undefined ? await render() : last;
          last = files;
          const file = page ? `${name}index.html` : name;
          if (files.has(`${file}/index.html`)) {
            res.statusCode = 302;
            res.setHeader("Location", `${path}/`);
            res.end();
            return;
          }
          const content = files.get(file);
          if (content === undefined) return next();
          res.setHeader("Content-Type", TYPES[file.split(".").at(-1)!]!);
          res.end(content);
        } catch (error) {
          if (!(error instanceof DocsSiteError)) return next(error);
          res.statusCode = 500;
          res.setHeader("Content-Type", TYPES.txt!);
          res.end(error.message);
        }
      });
    },

    async generateBundle() {
      if (options.ref === null) this.warn(UNKNOWN_REF);
      const inputs = await drawInputs();
      const mode = diagramMode(env);
      const files = await renderDocsSite({
        ...site(),
        inputs,
        draw: (diagrams) =>
          drawDiagrams(diagrams, {
            inputs,
            cacheDir,
            mode,
            launch,
            warn: (message) => this.warn(message),
          }),
      });
      for (const [path, source] of files) {
        this.emitFile({ type: "asset", fileName: `docs/${path}`, source });
      }
    },

    async closeBundle() {
      const started = browser;
      browser = undefined;
      await (await started?.catch(() => undefined))?.close();
    },
  };
}
