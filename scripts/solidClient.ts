// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The Solid client the build and the tests use, chosen by SOLID_CLIENT
 * when a config loads (vitest.shared.ts, apps/web/vite.config.ts,
 * e2e/pod/vitest.config.ts):
 *
 * - unset, empty or `inrupt`: the modules over Inrupt's libraries
 *   (packages/solid/src/client/), the default; nothing is redirected;
 * - `solid-memo-client`: every import of a module that client replaces
 *   (REPLACEMENTS) resolves to its module of the same name in
 *   packages/solid-memo-client/src/, which uses no Inrupt library.
 *   Callers don't change, and the client's own imports are left alone;
 * - anything else: the config fails to load, naming the values above.
 */
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** The values SOLID_CLIENT may take, the default first. */
const SOLID_CLIENTS = ["inrupt", "solid-memo-client"] as const;

/** Where solid-memo-client is, from the repository's root. */
const CLIENT = "packages/solid-memo-client/";

/**
 * The modules solid-memo-client replaces, each by its module of the same
 * name, from the repository's root. Its exports are used where the
 * module it replaces is (scripts/checkExports.ts).
 */
export const REPLACEMENTS: Record<string, string> = Object.fromEntries(
  [
    "packages/solid/src/client/rdf.ts",
    "packages/solid/src/client/resources.ts",
    "packages/solid/src/client/session.ts",
    "packages/solid/src/client/access.ts",
    "packages/shacl/src/turtleDocument.ts",
  ].map((module) => [module, `${CLIENT}src/${module.slice(module.lastIndexOf("/") + 1)}`]),
);

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * The Vite plugin that puts the client SOLID_CLIENT (`choice`) names in
 * place; it throws on a value that names none. `root` is the
 * repository's, with a trailing slash.
 */
export function solidClientPlugin(choice = process.env.SOLID_CLIENT, root = ROOT): Plugin {
  const name = "solid-memo:solid-client";
  if (choice !== undefined && choice !== "" && !SOLID_CLIENTS.some((one) => one === choice)) {
    throw new Error(
      `SOLID_CLIENT="${choice}" names no Solid client: leave it unset, or set it to ${SOLID_CLIENTS.map((one) => `"${one}"`).join(" or ")}.`,
    );
  }
  // With Inrupt's client the plugin has no hook at all: a resolveId hook
  // that only returns null still stops vi.mock from replacing client modules.
  if (choice !== "solid-memo-client") return { name };
  const replacements = new Map(
    Object.entries(REPLACEMENTS).map(([module, replacement]) => [
      `${root}${module}`,
      `${root}${replacement}`,
    ]),
  );
  return {
    name,
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (importer === undefined || importer.startsWith(`${root}${CLIENT}`)) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return (resolved && replacements.get(resolved.id)) ?? null;
    },
  };
}
