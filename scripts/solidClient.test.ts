// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { REPLACEMENTS, solidClientPlugin } from "./solidClient.ts";

const ROOT = "/repo/";

/**
 * Where the plugin resolves `source`, imported from `importer`, when
 * the build would resolve it to `ROOT` + `resolved` (null for nothing).
 */
async function resolve(
  plugin: ReturnType<typeof solidClientPlugin>,
  source: string,
  importer: string | undefined,
  resolved: string | null = source,
): Promise<string | null> {
  const context = {
    resolve: async () => (resolved === null ? null : { id: `${ROOT}${resolved}` }),
  };
  const hook = plugin.resolveId as unknown as (
    this: typeof context,
    source: string,
    importer: string | undefined,
    options: object,
  ) => Promise<string | null>;
  return hook.call(context, source, importer, {});
}

const DECLARED = ["rdf", "resources", "session", "access"];

describe("solidClientPlugin", () => {
  it("runs before Vite's own resolution", () => {
    expect(solidClientPlugin(undefined, ROOT).enforce).toBe("pre");
  });

  it("puts Inrupt's client in place of each declared module, unset, empty or named", async () => {
    const importer = `${ROOT}packages/solid/src/datasets.ts`;
    for (const choice of [undefined, "", "inrupt"]) {
      const plugin = solidClientPlugin(choice, ROOT);
      for (const name of DECLARED) {
        await expect(
          resolve(
            plugin,
            `@solid-memo/solid-client/${name}`,
            importer,
            `packages/solid-client/src/${name}.ts`,
          ),
        ).resolves.toBe(`${ROOT}packages/inrupt-client/src/${name}.ts`);
      }
      // Shacl reads Turtle with Inrupt's library itself.
      await expect(
        resolve(plugin, "./turtleDocument", importer, "packages/shacl/src/turtleDocument.ts"),
      ).resolves.toBeNull();
    }
  });

  it("reads SOLID_CLIENT when given no choice", async () => {
    const before = process.env.SOLID_CLIENT;
    const importer = `${ROOT}packages/solid/src/datasets.ts`;
    try {
      process.env.SOLID_CLIENT = "solid-memo-client";
      await expect(
        resolve(
          solidClientPlugin(undefined, ROOT),
          "./x",
          importer,
          "packages/solid-client/src/rdf.ts",
        ),
      ).resolves.toBe(`${ROOT}packages/solid-memo-client/src/rdf.ts`);
    } finally {
      if (before === undefined) delete process.env.SOLID_CLIENT;
      else process.env.SOLID_CLIENT = before;
    }
  });

  it("fails on a value that names no client, naming the values that do", () => {
    expect(() => solidClientPlugin("alt", ROOT)).toThrow(
      'SOLID_CLIENT="alt" names no Solid client: leave it unset, or set it to "inrupt" or "solid-memo-client".',
    );
  });

  describe("with solid-memo-client", () => {
    const plugin = solidClientPlugin("solid-memo-client", ROOT);

    it("resolves each declared module, and shacl's reader of Turtle, to the file of the same name in packages/solid-memo-client/src/", async () => {
      const importer = `${ROOT}packages/solid/src/datasets.ts`;
      for (const module of [
        ...DECLARED.map((name) => `packages/solid-client/src/${name}.ts`),
        "packages/shacl/src/turtleDocument.ts",
      ]) {
        await expect(resolve(plugin, "./x", importer, module)).resolves.toBe(
          `${ROOT}packages/solid-memo-client/src/${module.slice(module.lastIndexOf("/") + 1)}`,
        );
      }
    });

    it("leaves any other module, and one the build cannot resolve, as it is", async () => {
      const importer = `${ROOT}packages/solid/src/datasets.ts`;
      for (const module of [
        "packages/solid-client/src/interface.ts",
        "packages/solid-client/src/sparqlUpdate.ts",
        "packages/inrupt-client/src/rdf.ts",
        "elsewhere/packages/solid-client/src/rdf.ts",
      ]) {
        await expect(resolve(plugin, "./x", importer, module)).resolves.toBeNull();
      }
      await expect(resolve(plugin, "./x", importer, null)).resolves.toBeNull();
    });

    it("leaves an entry point, and the client's own imports, as they are", async () => {
      const declared = "packages/solid-client/src/rdf.ts";
      await expect(resolve(plugin, "./x", undefined, declared)).resolves.toBeNull();
      await expect(
        resolve(plugin, "./x", `${ROOT}packages/solid-memo-client/src/rdf.test.ts`, declared),
      ).resolves.toBeNull();
    });
  });
});

describe("REPLACEMENTS", () => {
  it("pairs each declared module with each client's, and shacl's reader with solid-memo-client's", () => {
    expect(REPLACEMENTS).toEqual([
      ...DECLARED.map((name) => [
        `packages/solid-client/src/${name}.ts`,
        `packages/inrupt-client/src/${name}.ts`,
      ]),
      ...DECLARED.map((name) => [
        `packages/solid-client/src/${name}.ts`,
        `packages/solid-memo-client/src/${name}.ts`,
      ]),
      ["packages/shacl/src/turtleDocument.ts", "packages/solid-memo-client/src/turtleDocument.ts"],
    ]);
  });
});
