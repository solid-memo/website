// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The Solid client the build and the tests use, chosen by SOLID_CLIENT
 * when a config loads (vitest.shared.ts, apps/web/vite.config.ts,
 * e2e/pod/vitest.config.ts). The modules a client gives are declared,
 * without a body, in packages/adapters/solid-client (DECLARED); every import of
 * one resolves to the module of the same name in the client chosen:
 *
 * - unset, empty or `inrupt`: packages/adapters/inrupt-client/src/, on Inrupt's
 *   libraries, the default;
 * - `solid-memo-client`: packages/adapters/solid-memo-client/src/, on no Inrupt
 *   library, which also takes the place of shacl's turtleDocument.ts;
 * - anything else: the config fails to load, naming the values above.
 *
 * Callers don't change, and neither client is imported by name.
 */
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** The values SOLID_CLIENT may take, the default first, each with its client's package. */
const SOLID_CLIENTS = {
  inrupt: "inrupt-client",
  "solid-memo-client": "solid-memo-client",
} as const;

/** A Solid client's package, under packages/adapters/. */
type SolidClient = (typeof SOLID_CLIENTS)[keyof typeof SOLID_CLIENTS];

/** The modules a client gives, declared in packages/adapters/solid-client/src/, by name. */
const DECLARED = ["rdf", "resources", "session", "access"] as const;

/**
 * The modules `client` puts in place, each by its module of the same
 * name, from the repository's root: every declared one, and for
 * solid-memo-client shacl's reader of Turtle too, which reads with
 * Inrupt's library. Its exports are used where the module it replaces
 * is (scripts/checkExports.ts).
 */
function replacementsOf(client: SolidClient): Record<string, string> {
  const own = `packages/adapters/${client}/src/`;
  return Object.fromEntries([
    ...DECLARED.map((name) => [
      `packages/adapters/solid-client/src/${name}.ts`,
      `${own}${name}.ts`,
    ]),
    ...(client === "solid-memo-client"
      ? [["packages/adapters/shacl/src/turtleDocument.ts", `${own}turtleDocument.ts`]]
      : []),
  ]);
}

/**
 * Every module a client puts in place, with the one it replaces, for
 * every client: their exports are used where the modules they replace
 * are (scripts/checkExports.ts).
 */
export const REPLACEMENTS: [string, string][] = Object.values(SOLID_CLIENTS).flatMap((client) =>
  Object.entries(replacementsOf(client)),
);

const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The client SOLID_CLIENT (`choice`) names; it throws on a value that names none. */
function solidClientOf(choice: string | undefined): SolidClient {
  if (choice === undefined || choice === "") return SOLID_CLIENTS.inrupt;
  if (!Object.hasOwn(SOLID_CLIENTS, choice)) {
    throw new Error(
      `SOLID_CLIENT="${choice}" names no Solid client: leave it unset, or set it to ${Object.keys(
        SOLID_CLIENTS,
      )
        .map((one) => `"${one}"`)
        .join(" or ")}.`,
    );
  }
  return SOLID_CLIENTS[choice as keyof typeof SOLID_CLIENTS];
}

/**
 * The Vite plugin that puts the client SOLID_CLIENT (`choice`) names in
 * place of the modules packages/adapters/solid-client declares. `root` is the
 * repository's, with a trailing slash.
 */
export function solidClientPlugin(choice = process.env.SOLID_CLIENT, root = ROOT): Plugin {
  const client = solidClientOf(choice);
  const replacements = new Map(
    Object.entries(replacementsOf(client)).map(([module, replacement]) => [
      `${root}${module}`,
      `${root}${replacement}`,
    ]),
  );
  return {
    name: "solid-memo:solid-client",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (importer === undefined || importer.startsWith(`${root}packages/adapters/${client}/`))
        return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return (resolved && replacements.get(resolved.id)) ?? null;
    },
  };
}
