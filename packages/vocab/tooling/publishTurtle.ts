import type { Plugin } from "vite";
import { readTurtleTree } from "@solid-memo/turtle/rdf";

/**
 * Publishing a folder of Turtle with the site: every `.ttl` under it is
 * served in dev and emitted into `dist/` under the same path. The site
 * publishes Solid Memo's vocabulary and shapes (ns/), the deck library
 * (decks/) and the vendored profiles (vendor/) this way, so their IRIs
 * dereference to the documents in this repository.
 */

const TURTLE = "text/turtle; charset=utf-8";

/** A safe relative path: no empty, `.` or `..` segments. */
function isPlainPath(name: string): boolean {
  return name.split("/").every((segment) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(segment));
}

export function turtleDirectoryPlugin({ dir, publicPath = dir }: { dir: string; publicPath?: string }): Plugin {
  return {
    name: `solid-memo:publish-${publicPath}`,

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? "").split("?")[0];
        const prefix = `/${publicPath}/`;
        if (!path.startsWith(prefix)) return next();
        const name = path.slice(prefix.length);
        try {
          if (!isPlainPath(name) || !name.endsWith(".ttl")) return next();
          const file = (await readTurtleTree(dir)).find((f) => f.path === name);
          if (file === undefined) return next();
          res.setHeader("Content-Type", TURTLE);
          res.end(file.turtle);
        } catch (error) {
          next(error);
        }
      });
    },

    async generateBundle() {
      for (const { path, turtle } of await readTurtleTree(dir)) {
        this.emitFile({
          type: "asset",
          fileName: `${publicPath}/${path}`,
          source: turtle,
        });
      }
    },
  };
}
