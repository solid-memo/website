import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

/**
 * Publishing another app's build with the site: every file of its `dist/`
 * is emitted into this build's `dist/` under `publicPath`, as it is. The
 * site publishes the Studio this way, at studio/ (docs/studio.md), so
 * both apps are served from one origin. It copies whatever build is
 * there, so the site is built through turbo (`npm run build`), which
 * builds the app first; with no build there it warns and publishes none.
 */
export function builtAppPlugin({
  dir,
  publicPath,
}: {
  dir: string;
  publicPath: string;
}): Plugin {
  return {
    name: `solid-memo:publish-${publicPath}`,
    apply: "build",

    async generateBundle() {
      if (!existsSync(dir)) {
        this.warn(
          `No build at ${dir}, so nothing is published at ${publicPath}/: build the site with npm run build.`,
        );
        return;
      }
      const entries = await readdir(dir, {
        recursive: true,
        withFileTypes: true,
      });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
        .sort();
      for (const path of files) {
        this.emitFile({
          type: "asset",
          fileName: `${publicPath}/${path}`,
          source: await readFile(join(dir, path)),
        });
      }
    },
  };
}
