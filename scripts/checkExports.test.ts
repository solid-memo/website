// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import {
  defaultIo,
  isTest,
  main,
  moduleRecord,
  type Package,
  resolveImport,
  run,
  unusedExports,
} from "./checkExports.ts";

/** A package at packages/<name>, @solid-memo/<name>, its files under src/. */
function pkg(name: string, files: Record<string, string>, manifest = {}): Package {
  return {
    dir: `packages/${name}`,
    manifest: { name: `@solid-memo/${name}`, exports: { "./*": "./src/*.ts" }, ...manifest },
    files,
  };
}

describe("moduleRecord", () => {
  it("lists what each import names, a namespace, export * or import() naming the whole module", () => {
    const { imports } = moduleRecord(
      "a.ts",
      `import { a, type B as C } from "./x";
import * as n from "./y";
import d from "./d";
export { q } from "./z";
export * from "./w";
export * as all from "./v";
const lazy = import("./lazy");
const dynamic = import(\`./\${n.name}\`);`,
    );
    expect(imports).toEqual([
      { specifier: "./x", names: ["a", "B"] },
      { specifier: "./y", names: "*" },
      { specifier: "./d", names: [] },
      { specifier: "./z", names: ["q"] },
      { specifier: "./w", names: "*" },
      { specifier: "./v", names: "*" },
      { specifier: "./lazy", names: "*" },
    ]);
  });

  it("says of each export whether its own file uses it", () => {
    const { exports } = moduleRecord(
      "a.tsx",
      `export const LIMIT = 3;
export const UNUSED = 4;
export function helper() { return LIMIT; }
export function lonely() {}
export type Shape = { size: number };
export type Other = Shape;
export interface Named { lonely: string; UNUSED: number }
const local = 1;
export { local as renamed };
export default helper;
const view = () => <Shown />;
export function Shown() { return null; }
const keyed = { lonely: 1, [UNUSED]: 2 };
keyed.lonely;
const shorthand = { local };`,
    );
    expect(Object.fromEntries(exports)).toEqual({
      LIMIT: true,
      UNUSED: true,
      helper: true,
      lonely: false,
      Shape: true,
      Other: false,
      Named: false,
      renamed: true,
      Shown: true,
    });
  });

  it("counts no property name, key, label or import as a use", () => {
    const { exports } = moduleRecord(
      "a.ts",
      `import { other as alone } from "./b";
export function alone2() {}
export const alone = 1;
class K { alone = 1; alone2() {} }
type T = { alone: 1; alone2(): void };
enum E { alone }
let q: K.alone;
alone: for (;;) { break alone; continue alone; }
const x = { alone: 1 };
x.alone;
const y = <div alone2="1" />;
const z = <x.alone />;`,
    );
    expect(Object.fromEntries(exports)).toEqual({ alone2: false, alone: false });
  });
});

describe("resolveImport", () => {
  const packages = [
    pkg(
      "domain",
      {},
      {
        exports: { "./shapes/migrations": "./src/shapes/migrations/index.ts", "./*": "./src/*.ts" },
      },
    ),
    pkg(
      "vocab",
      {},
      {
        exports: {
          "./tooling/*": "./tooling/*.ts",
          "./locales/*": "./src/locales/*/*.ts",
          "./*": "./src/*.ts",
        },
      },
    ),
    pkg("ui", {}, { exports: { "./style.css": "./src/style.css" } }),
    { dir: ".", manifest: { name: "solid-memo" }, files: {} },
  ];
  const files = new Set([
    "packages/domain/src/deck.ts",
    "packages/domain/src/shapes/migrations/index.ts",
    "packages/domain/src/release/index.ts",
    "packages/vocab/tooling/testing/shapeSources.ts",
    "packages/vocab/src/locales/en/en.ts",
    "packages/ui/src/ui/App.tsx",
    "packages/ui/src/style.css",
  ]);
  const exists = (file: string) => files.has(file);
  const resolve = (specifier: string, from = "packages/ui/src/ui/x.ts") =>
    resolveImport(specifier, from, packages, exists);

  it("finds a relative import with or without its extension, or a folder's index", () => {
    expect(resolve("./App")).toBe("packages/ui/src/ui/App.tsx");
    expect(resolve("../style.css?inline")).toBe("packages/ui/src/style.css");
    expect(resolve("./deck", "packages/domain/src/a.ts")).toBe("packages/domain/src/deck.ts");
    expect(resolve("./release", "packages/domain/src/a.ts")).toBe(
      "packages/domain/src/release/index.ts",
    );
  });

  it("finds a workspace package's file through its exports, a pattern's (every * of its target) or an exact one", () => {
    expect(resolve("@solid-memo/domain/deck")).toBe("packages/domain/src/deck.ts");
    expect(resolve("@solid-memo/domain/shapes/migrations")).toBe(
      "packages/domain/src/shapes/migrations/index.ts",
    );
    expect(resolve("@solid-memo/vocab/tooling/testing/shapeSources")).toBe(
      "packages/vocab/tooling/testing/shapeSources.ts",
    );
    expect(resolve("@solid-memo/vocab/locales/en")).toBe("packages/vocab/src/locales/en/en.ts");
    expect(resolve("@solid-memo/ui/style.css")).toBe("packages/ui/src/style.css");
  });

  it("finds nothing for a vendor's package, an export there is not, a package without exports, or a file that is not there", () => {
    expect(resolve("preact")).toBeNull();
    expect(resolve("@solid-memo/ui/router")).toBeNull();
    expect(resolve("@solid-memo/ui")).toBeNull();
    expect(resolve("solid-memo/scripts/checkDocs")).toBeNull();
    expect(resolve("./Missing")).toBeNull();
  });
});

describe("isTest", () => {
  it("knows test files, helpers and configs, and every end-to-end file", () => {
    expect(isTest("packages/domain", "src/deck.test.ts")).toBe(true);
    expect(isTest("packages/domain", "src/testing/libraryDeck.ts")).toBe(true);
    expect(isTest("packages/vocab", "tooling/testing/shapeSources.ts")).toBe(true);
    expect(isTest("packages/ui", "vitest.config.ts")).toBe(true);
    expect(isTest("e2e/pod", "servers.ts")).toBe(true);
    expect(isTest("packages/domain", "src/deck.ts")).toBe(false);
  });
});

describe("unusedExports", () => {
  it("names an export only tests use, and keeps one code uses", () => {
    const packages = [
      pkg("domain", {
        "src/deck.ts":
          "export const used = 1;\nexport const onlyTested = 2;\nexport type Kept = 1;",
        "src/deck.test.ts": 'import { onlyTested } from "./deck";',
      }),
      pkg("ui", { "src/App.tsx": 'import { used, type Kept } from "@solid-memo/domain/deck";' }),
    ];
    expect(unusedExports(packages)).toEqual(["packages/domain/src/deck.ts: onlyTested"]);
  });

  it("keeps a module's exports when it is imported whole, and adds up what each import names", () => {
    const packages = [
      pkg("domain", {
        "src/a.ts": "export const one = 1;\nexport const two = 2;",
        "src/b.ts": "export const three = 3;",
        "src/c.ts":
          'import { one } from "./a";\nimport { two } from "./a";\nimport * as all from "./b";',
        "src/d.ts": 'import { one } from "./b";\nexport * from "./e";',
        "src/e.ts": "export const four = 4;",
      }),
    ];
    expect(unusedExports(packages)).toEqual([]);
  });

  it("keeps what a package.json script calls, by a path or by a package's name", () => {
    const packages = [
      pkg(
        "vocab",
        {
          "tooling/generate.ts": "export function run() {}\nexport function other() {}",
          "tooling/format.ts": "export function run() {}",
        },
        {
          scripts: {
            generate: "node -e \"import('./tooling/generate.ts').then((m) => m.run(process))\"",
            format:
              "node -e \"import('@solid-memo/vocab/tooling/format').then((m) => m.run(process))\"",
            missing:
              "node -e \"import('@solid-memo/vocab/tooling/missing').then((m) => m.run(process))\"",
          },
          exports: { "./tooling/*": "./tooling/*.ts" },
        },
      ),
      {
        dir: ".",
        manifest: { name: "solid-memo" },
        files: { "scripts/check.ts": "export function run() {}" },
      },
    ];
    expect(unusedExports(packages)).toEqual([
      "packages/vocab/tooling/generate.ts: other",
      "scripts/check.ts: run",
    ]);
  });

  it("keeps a replacement's exports where the module it replaces is used, by name or whole", () => {
    const packages = [
      pkg("solid", {
        "src/rdf.ts": "export const used = 1;\nexport const unused = 2;",
        "src/access.ts": "export const grant = 1;",
        "src/session.ts": "export const login = 1;",
        "src/app.ts":
          'import { used } from "./rdf";\nimport * as access from "./access";\nconsole.log(used, access);',
      }),
      pkg("other", {
        "src/rdf.ts": "export const used = 1;\nexport const unused = 2;\nexport const extra = 3;",
        "src/access.ts": "export const grant = 1;\nexport const extra = 2;",
        "src/session.ts": "export const login = 1;",
      }),
    ];
    expect(
      unusedExports(packages, {
        "packages/solid/src/rdf.ts": "packages/other/src/rdf.ts",
        "packages/solid/src/access.ts": "packages/other/src/access.ts",
        "packages/solid/src/session.ts": "packages/other/src/session.ts",
      }),
    ).toEqual([
      "packages/other/src/rdf.ts: extra",
      "packages/other/src/rdf.ts: unused",
      "packages/other/src/session.ts: login",
      "packages/solid/src/rdf.ts: unused",
      "packages/solid/src/session.ts: login",
    ]);
  });

  it("leaves out the tests' own exports, the end-to-end tests' and the generated files'", () => {
    const packages = [
      pkg("domain", {
        "src/testing/helper.ts": "export const helper = 1;",
        "src/types.generated.ts": "export type Generated = 1;",
      }),
      {
        dir: "e2e/pod",
        manifest: { name: "@solid-memo/e2e-pod" },
        files: { "pod.ts": "export const x = 1;" },
      },
    ];
    expect(unusedExports(packages)).toEqual([]);
  });
});

describe("main", () => {
  function fakeIo(packages: Package[]) {
    const logs: string[] = [];
    return { logs, packages: () => packages, log: (message: string) => logs.push(message) };
  }

  it("says so and returns 0 when code uses every export", () => {
    const io = fakeIo([pkg("domain", { "src/a.ts": "export const a = 1;\nconsole.log(a);" })]);
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual(["Code that is not a test uses every export."]);
  });

  it("logs each unused export and returns 1", () => {
    const io = fakeIo([pkg("domain", { "src/a.ts": "export const a = 1;" })]);
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      "packages/domain/src/a.ts: a",
      "1 export(s) nothing but tests uses: remove each with its tests, or use it.",
    ]);
  });
});

describe("the repository's exports", () => {
  it("are all used by code that is not a test", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(log.mock.calls).toEqual([["Code that is not a test uses every export."]]);
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });

  it("are read from the workspace packages and scripts/", () => {
    const packages = defaultIo(`${import.meta.dirname}/..`).packages();
    expect(packages.map(({ dir }) => dir)).toContain("packages/domain");
    expect(packages.at(-1)!.dir).toBe(".");
    expect(Object.keys(packages.at(-1)!.files)).toContain("scripts/checkExports.ts");
  });
});
