// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { solidClientPlugin } from "./solidClient.ts";

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

describe("solidClientPlugin", () => {
  it("has no hook with Inrupt's client: unset, empty or named", () => {
    for (const choice of [undefined, "", "inrupt"]) {
      expect(solidClientPlugin(choice, ROOT)).toEqual({ name: "solid-memo:solid-client" });
    }
  });

  it("reads SOLID_CLIENT when given no choice", () => {
    const before = process.env.SOLID_CLIENT;
    try {
      delete process.env.SOLID_CLIENT;
      expect(solidClientPlugin().resolveId).toBeUndefined();
      process.env.SOLID_CLIENT = "solid-memo-client";
      expect(solidClientPlugin().resolveId).toBeTypeOf("function");
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

    it("runs before Vite's own resolution", () => {
      expect(plugin.enforce).toBe("pre");
    });

    it("resolves each module it replaces to the file of the same name in packages/solid-memo-client/src/", async () => {
      const importer = `${ROOT}packages/solid/src/datasets.ts`;
      for (const [module, file] of [
        ["packages/solid/src/client/rdf.ts", "rdf.ts"],
        ["packages/solid/src/client/resources.ts", "resources.ts"],
        ["packages/solid/src/client/session.ts", "session.ts"],
        ["packages/solid/src/client/access.ts", "access.ts"],
        ["packages/shacl/src/turtleDocument.ts", "turtleDocument.ts"],
      ] as const) {
        await expect(resolve(plugin, "./client/x", importer, module)).resolves.toBe(
          `${ROOT}packages/solid-memo-client/src/${file}`,
        );
      }
    });

    it("leaves any other module, and one the build cannot resolve, as it is", async () => {
      const importer = `${ROOT}packages/solid/src/datasets.ts`;
      for (const module of [
        "packages/solid/src/client/interface.ts",
        "packages/solid/src/client/sparqlUpdate.ts",
        "packages/solid/src/client/rdf.test.ts",
        "elsewhere/packages/solid/src/client/rdf.ts",
      ]) {
        await expect(resolve(plugin, "./x", importer, module)).resolves.toBeNull();
      }
      await expect(resolve(plugin, "./x", importer, null)).resolves.toBeNull();
    });

    it("leaves an entry point, and the client's own imports, as they are", async () => {
      const replaced = "packages/solid/src/client/rdf.ts";
      await expect(resolve(plugin, "./x", undefined, replaced)).resolves.toBeNull();
      await expect(
        resolve(plugin, "./x", `${ROOT}packages/solid-memo-client/src/rdf.test.ts`, replaced),
      ).resolves.toBeNull();
    });
  });
});
