// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  boundaryProblems,
  LAYERS,
  defaultIo,
  isTestFile,
  main,
  packageName,
  run,
  sourceFiles,
  type Workspace,
} from "./checkBoundaries.ts";

const TOOLING = new Set(["vitest"]);

/** A workspace package of the given name, with the given sources and dependencies. */
/** The folder that groups each package by its role, for a package in one (docs/architecture.md). */
const ROLE: Record<string, string> = {
  domain: "core",
  application: "core",
  browser: "adapters",
  "inrupt-client": "adapters",
  shacl: "adapters",
  solid: "adapters",
  "solid-client": "adapters",
  "solid-memo-client": "adapters",
  markdown: "lib",
  turtle: "lib",
  vocab: "lib",
};

function workspace(
  name: string,
  files: Record<string, string>,
  dependencies: Record<string, string> = {},
): Workspace {
  return {
    dir: ROLE[name] === undefined ? `packages/${name}` : `packages/${ROLE[name]}/${name}`,
    manifest: { name: `@solid-memo/${name}`, dependencies },
    files,
  };
}

/** The problems with one package's files. */
const problems = (pkg: Workspace) => boundaryProblems([pkg], TOOLING);

describe("packageName", () => {
  it("is the scope and name of a scoped specifier, or the name of a plain one", () => {
    expect(packageName("@solid-memo/vocab/tooling/generate")).toBe("@solid-memo/vocab");
    expect(packageName("n3/lib/N3Lexer")).toBe("n3");
  });
});

describe("isTestFile", () => {
  it.each([
    ["src/deck.test.ts", true],
    ["src/App.test.tsx", true],
    ["src/testing/libraryDeck.ts", true],
    ["harness/test/server.ts", true],
    ["vitest.config.ts", true],
    ["vitest.journeys.config.ts", true],
    ["globalSetup.ts", true],
    ["src/deck.ts", false],
    ["src/contest/rules.ts", false],
  ])("%s: %s", (path, expected) => {
    expect(isTestFile(path)).toBe(expected);
  });
});

describe("boundaryProblems", () => {
  it("passes a package that keeps to its boundaries", () => {
    expect(
      problems(
        workspace(
          "domain",
          {
            "src/deck.ts": [
              'import { DECK } from "@solid-memo/vocab";',
              'import type { Card } from "./card.ts";',
            ].join("\n"),
          },
          { "@solid-memo/vocab": "*" },
        ),
      ),
    ).toEqual([]);
  });

  it("names a package that is not in the layer table", () => {
    expect(problems(workspace("unknown", { "src/a.ts": 'import "zod";' }))).toEqual([
      "@solid-memo/unknown: not in the layer table of scripts/checkBoundaries.ts.",
    ]);
  });

  it("fails on a relative import that leaves the package, a config's shared setup aside", () => {
    expect(
      problems(
        workspace("turtle", {
          "src/a.ts": 'import { b } from "../../domain/src/b.ts";\nimport { c } from "./c.ts";',
          "src/deep/d.ts": 'import { e } from "../e.ts";',
          "vitest.config.ts": 'import { packageConfig } from "../../../vitest.shared.ts";',
          "vitest.roundtrip.config.ts":
            'import { packageConfig } from "../../../vitest.shared.ts";',
          "vite.config.ts": 'import { solidClientPlugin } from "../../../scripts/solidClient.ts";',
          "tooling/x.ts": 'import { y } from "../../../vitest.shared.ts";',
          "tooling/y.ts": 'import { z } from "../../../scripts/solidClient.ts";',
          "vite.other.config.ts": 'import { z } from "../../../scripts/checkBoundaries.ts";',
        }),
      ),
    ).toEqual([
      'packages/lib/turtle/src/a.ts: "../../domain/src/b.ts" reaches outside the package.',
      'packages/lib/turtle/tooling/x.ts: "../../../vitest.shared.ts" reaches outside the package.',
      'packages/lib/turtle/tooling/y.ts: "../../../scripts/solidClient.ts" reaches outside the package.',
      'packages/lib/turtle/vite.other.config.ts: "../../../scripts/checkBoundaries.ts" reaches outside the package.',
    ]);
  });

  it("fails on a workspace package the layer may not use, or that package.json does not declare", () => {
    expect(
      problems(
        workspace(
          "domain",
          {
            "src/a.ts": [
              'import { x } from "@solid-memo/solid";',
              'import { y } from "@solid-memo/vocab";',
              'import { z } from "@solid-memo/domain/testing/libraryDeck";',
            ].join("\n"),
          },
          { "@solid-memo/solid": "*" },
        ),
      ),
    ).toEqual([
      "packages/core/domain/src/a.ts: @solid-memo/domain may not import @solid-memo/solid.",
      "packages/core/domain/src/a.ts: imports @solid-memo/vocab, which package.json does not declare.",
    ]);
  });

  it("fails on a workspace package imported from a file that may not import it", () => {
    expect(
      problems(
        workspace(
          "vocab",
          {
            "tooling/generate.ts": 'import { parse } from "@solid-memo/turtle";',
            "src/index.ts": 'import { parse } from "@solid-memo/turtle";',
          },
          { "@solid-memo/turtle": "*" },
        ),
      ),
    ).toEqual([
      "packages/lib/vocab/src/index.ts: only files matching /^tooling\\// may import @solid-memo/turtle.",
      'packages/lib/vocab/src/index.ts: runs in the browser, so may not import "@solid-memo/turtle".',
    ]);
  });

  it("lets the site's config and tests use its build, and nothing in its page", () => {
    const web = {
      ...workspace(
        "web",
        {
          "vite.config.ts": 'import { docsSitePlugin } from "@solid-memo/build-tools/publishDocs";',
          "src/build.test.ts": 'import { checkSvg } from "@solid-memo/build-tools/diagrams";',
          "src/aboutPage.test.ts": 'import { siteOrigin } from "@solid-memo/build-tools/siteMap";',
          "src/App.tsx": 'import { siteOrigin } from "@solid-memo/build-tools/siteMap";',
        },
        { "@solid-memo/build-tools": "*" },
      ),
      dir: "apps/web",
    };
    expect(problems(web)).toEqual([
      "apps/web/src/App.tsx: only files matching /^(vite\\.config\\.ts|src\\/[^/]+\\.test\\.ts)$/ may import @solid-memo/build-tools.",
      'apps/web/src/App.tsx: runs in the browser, so may not import "@solid-memo/build-tools/siteMap".',
    ]);
  });

  it("fails on an entry point of a package other than those the importer may use", () => {
    expect(
      problems(
        workspace(
          "build-tools",
          {
            "src/siteBuild.ts": 'import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";',
            "src/siteMap.ts": 'import { run } from "@solid-memo/vocab/tooling/generate";',
          },
          { "@solid-memo/vocab": "*" },
        ),
      ),
    ).toEqual([
      'packages/build-tools/src/siteMap.ts: may import only /^@solid-memo\\/vocab\\/tooling\\/root$/ of @solid-memo/vocab, not "@solid-memo/vocab/tooling/generate".',
    ]);
  });

  it("holds the layer table to the folders that group packages by role", () => {
    const at = (name: string, dir: string): Workspace => ({ ...workspace(name, {}), dir });
    const table = (name: string, imports: string[]) => {
      const before = LAYERS[name];
      LAYERS[name] = imports;
      return () => {
        if (before === undefined) delete LAYERS[name];
        else LAYERS[name] = before;
      };
    };
    const restore = [
      table("domain", ["vocab", "ui"]),
      table("vocab", ["domain"]),
      table("ui", ["solid"]),
      table("composition", ["solid"]),
    ];
    try {
      expect(
        boundaryProblems(
          [
            at("domain", "packages/core/domain"),
            at("vocab", "packages/lib/vocab"),
            at("ui", "packages/ui"),
            at("composition", "packages/composition"),
            at("solid", "packages/adapters/solid"),
          ],
          TOOLING,
        ),
      ).toEqual([
        "packages/core/domain: a package in packages/core/ may import only packages in packages/core/, packages/lib/, not @solid-memo/ui (packages/ui).",
        "packages/lib/vocab: a package in packages/lib/ may import only packages in packages/lib/, not @solid-memo/domain (packages/core/domain).",
        "packages/ui: only the adapters, the composition root and the end-to-end tests may import an adapter, not @solid-memo/solid (packages/adapters/solid).",
      ]);
    } finally {
      for (const undo of restore) undo();
    }
  });

  it("lets a package's configs import the root's shared setup, however deep its folder", () => {
    const deep = {
      ...workspace("domain", {
        "vitest.config.ts": 'import { packageConfig } from "../../../vitest.shared.ts";',
        "src/a.ts": 'import { packageConfig } from "../../../vitest.shared.ts";',
      }),
      dir: "packages/core/domain",
    };
    expect(problems(deep)).toEqual([
      'packages/core/domain/src/a.ts: "../../../vitest.shared.ts" reaches outside the package.',
    ]);
  });

  it("holds an adapter to its own ports, and a screen to none", () => {
    expect(
      problems(
        workspace(
          "browser",
          {
            "src/webStorageDeviceStore.ts":
              'import type { DeviceStore } from "@solid-memo/application/ports/device";',
            "src/fileExchange.ts":
              'import type { DeckRepository } from "@solid-memo/application/ports/pod";',
          },
          { "@solid-memo/application": "*" },
        ),
      ),
    ).toEqual([
      'packages/adapters/browser/src/fileExchange.ts: may import only /^@solid-memo\\/application\\/ports\\/device$/ of @solid-memo/application, not "@solid-memo/application/ports/pod".',
    ]);
    expect(
      problems(
        workspace(
          "ui",
          {
            "src/ui/App.tsx": 'import type { UseCases } from "@solid-memo/application/useCases";',
            "src/ui/Screen.tsx":
              'import type { DeviceStore } from "@solid-memo/application/ports/device";',
          },
          { "@solid-memo/application": "*" },
        ),
      ),
    ).toEqual([
      'packages/ui/src/ui/Screen.tsx: may import only /^@solid-memo\\/application\\/(?!ports\\/)/ of @solid-memo/application, not "@solid-memo/application/ports/device".',
    ]);
  });

  it("fails on a static import of a package that may be loaded only lazily", () => {
    const web = {
      ...workspace(
        "web",
        {
          "src/main.tsx": [
            'const studio = () => import("@solid-memo/studio");',
            'import { Studio } from "@solid-memo/studio";',
          ].join("\n"),
        },
        { "@solid-memo/studio": "*" },
      ),
      dir: "apps/web",
    };
    expect(problems(web)).toEqual([
      "apps/web/src/main.tsx: may import @solid-memo/studio only with a dynamic import().",
    ]);
  });

  it("fails on an undeclared package, unless it is a declared type package or shared test tooling", () => {
    expect(
      problems(
        workspace(
          "turtle",
          {
            "src/a.ts": [
              'import { z } from "zod";',
              'import { Parser } from "n3";',
              'import { readFileSync } from "fs";',
              'import { it } from "vitest";',
            ].join("\n"),
            "src/a.test.ts": 'import { it } from "vitest";\nvi.mock("zod");',
            "vite.config.ts": 'import { defineConfig } from "vitest/config";',
          },
          { n3: "*", "@types/fs": "*" },
        ),
      ),
    ).toEqual([
      "packages/lib/turtle/src/a.ts: imports zod, which package.json does not declare.",
      "packages/lib/turtle/src/a.ts: imports vitest, which package.json does not declare.",
      "packages/lib/turtle/src/a.test.ts: imports zod, which package.json does not declare.",
    ]);
  });

  it("reads devDependencies as declared too", () => {
    const pkg = workspace("turtle", { "src/a.ts": 'import { z } from "zod";' });
    pkg.manifest = { name: "@solid-memo/turtle", devDependencies: { zod: "*" } };
    expect(problems(pkg)).toEqual([]);
  });

  it("fails on a node-only import in code that runs in the browser, tests and tooling aside", () => {
    expect(
      problems(
        workspace(
          "shacl",
          {
            "src/a.ts": [
              'import { readFileSync } from "node:fs";',
              'import { Parser } from "n3";',
              'import { load } from "@solid-memo/vocab/tooling/load";',
              'import { chromium } from "playwright";',
              'import mermaid from "mermaid/dist/mermaid.core.mjs";',
            ].join("\n"),
            "src/a.test.ts": 'import { readFileSync } from "node:fs";',
            "node/b.ts": 'import { chromium } from "playwright";',
          },
          { n3: "*", "@solid-memo/vocab": "*", playwright: "*", mermaid: "*" },
        ),
      ),
    ).toEqual([
      'packages/adapters/shacl/src/a.ts: runs in the browser, so may not import "node:fs".',
      'packages/adapters/shacl/src/a.ts: runs in the browser, so may not import "n3".',
      'packages/adapters/shacl/src/a.ts: runs in the browser, so may not import "@solid-memo/vocab/tooling/load".',
      'packages/adapters/shacl/src/a.ts: runs in the browser, so may not import "playwright".',
      'packages/adapters/shacl/src/a.ts: runs in the browser, so may not import "mermaid/dist/mermaid.core.mjs".',
    ]);
  });

  it("fails on any @inrupt/ package imported outside inrupt-client and shacl's Turtle reader, tests aside, once an import", () => {
    const client = workspace(
      "inrupt-client",
      {
        "src/rdf.ts": 'import { getThing } from "@inrupt/solid-client";',
        "src/session.ts": 'import { login } from "@inrupt/solid-client-authn-browser";',
      },
      { "@inrupt/solid-client": "*", "@inrupt/solid-client-authn-browser": "*" },
    );
    const solid = workspace(
      "solid",
      {
        "src/datasets.ts": [
          'import { getThing } from "@inrupt/solid-client";',
          'import * as authn from "@inrupt/solid-client-authn-browser";',
          'import type { UrlString } from "@inrupt/solid-client/universal";',
          'const lazy = () => import("@inrupt/solid-client");',
          'import { thing } from "@inrupt/solid-client-vocab";',
          'import * as solid from "@inrupt/solid-client";',
          'import { universalAccess } from "@inrupt/solid-client";',
        ].join("\n"),
        "src/datasets.test.ts": 'vi.mock("@inrupt/solid-client");',
        "src/testing/pod.ts": 'import { getThing } from "@inrupt/solid-client";',
      },
      {
        "@inrupt/solid-client": "*",
        "@inrupt/solid-client-authn-browser": "*",
        "@inrupt/solid-client-vocab": "*",
      },
    );
    const shacl = workspace(
      "shacl",
      {
        "src/turtleDocument.ts": 'import { getSolidDataset } from "@inrupt/solid-client";',
        "src/shapeLoader.ts": 'import { getSolidDataset } from "@inrupt/solid-client";',
      },
      { "@inrupt/solid-client": "*" },
    );
    const ui = workspace(
      "ui",
      { "src/ui/App.tsx": 'import { login } from "@inrupt/solid-client-authn-browser";' },
      { "@inrupt/solid-client-authn-browser": "*" },
    );
    const only =
      "only inrupt-client files matching /^src\\//, shacl files matching /^src\\/turtleDocument\\.ts$/ may.";
    expect(boundaryProblems([client, solid, shacl, ui], TOOLING)).toEqual([
      `packages/adapters/solid/src/datasets.ts: may not import "@inrupt/solid-client": ${only}`,
      `packages/adapters/solid/src/datasets.ts: may not import "@inrupt/solid-client-authn-browser": ${only}`,
      `packages/adapters/solid/src/datasets.ts: may not import "@inrupt/solid-client/universal": ${only}`,
      `packages/adapters/solid/src/datasets.ts: may not import "@inrupt/solid-client": ${only}`,
      `packages/adapters/solid/src/datasets.ts: may not import "@inrupt/solid-client-vocab": ${only}`,
      `packages/adapters/solid/src/datasets.ts: may not import "@inrupt/solid-client": ${only}`,
      `packages/adapters/solid/src/datasets.ts: may not import "@inrupt/solid-client": ${only}`,
      `packages/adapters/shacl/src/shapeLoader.ts: may not import "@inrupt/solid-client": ${only}`,
      `packages/ui/src/ui/App.tsx: may not import "@inrupt/solid-client-authn-browser": ${only}`,
    ]);
  });

  it("lets a client use n3 in the browser and run solid's contract in its tests, and no package import it", () => {
    const client = workspace(
      "solid-memo-client",
      {
        "src/rdf.ts": [
          'import { DataFactory } from "n3";',
          'import type { Dataset } from "@solid-memo/solid-client/interface";',
        ].join("\n"),
        "src/rdf.test.ts": 'import { rdfContract } from "@solid-memo/solid/testing/contract/rdf";',
        "src/resources.ts": 'import { readsOf } from "@solid-memo/solid/records";',
        "src/oidcStore.ts": 'import { readFileSync } from "node:fs";',
      },
      { n3: "*", "@solid-memo/solid-client": "*", "@solid-memo/solid": "*" },
    );
    const composition = workspace(
      "composition",
      {
        "src/a.ts": 'import { getThing } from "@solid-memo/solid-memo-client/rdf";',
        "src/b.ts": 'import { getThing } from "@solid-memo/inrupt-client/rdf";',
      },
      { "@solid-memo/solid-memo-client": "*", "@solid-memo/inrupt-client": "*" },
    );
    expect(boundaryProblems([client, composition], TOOLING)).toEqual([
      "packages/adapters/solid-memo-client/src/resources.ts: only files matching /\\.test\\.ts$/ may import @solid-memo/solid.",
      'packages/adapters/solid-memo-client/src/oidcStore.ts: runs in the browser, so may not import "node:fs".',
      "packages/composition/src/a.ts: @solid-memo/composition may not import @solid-memo/solid-memo-client.",
      "packages/composition/src/b.ts: @solid-memo/composition may not import @solid-memo/inrupt-client.",
    ]);
  });

  it("lets inrupt-client's Turtle parser use n3 in the browser, and no other file of it", () => {
    const client = workspace(
      "inrupt-client",
      {
        "src/linearDataset.ts": 'import { Parser } from "n3";',
        "src/resources.ts": 'import { Parser } from "n3";',
        "src/resources.test.ts": 'import { Parser } from "n3";',
      },
      { n3: "*" },
    );
    expect(boundaryProblems([client], TOOLING)).toEqual([
      'packages/adapters/inrupt-client/src/resources.ts: runs in the browser, so may not import "n3".',
    ]);
  });

  it("fails on any @inrupt/ package in solid-memo-client and the seam, their tests too, once an import", () => {
    const client = workspace(
      "solid-memo-client",
      {
        "src/rdf.ts": 'import { getThing } from "@inrupt/solid-client";',
        "src/rdf.test.ts": 'vi.mock("@inrupt/solid-client-authn-browser");',
        "src/access.ts": 'import { universalAccess } from "@inrupt/solid-client";',
      },
      { "@inrupt/solid-client": "*", "@inrupt/solid-client-authn-browser": "*" },
    );
    const seam = workspace(
      "solid-client",
      { "src/interface.ts": 'import type { Thing } from "@inrupt/solid-client";' },
      { "@inrupt/solid-client": "*" },
    );
    expect([...problems(client), ...problems(seam)]).toEqual([
      'packages/adapters/solid-memo-client/src/rdf.ts: @solid-memo/solid-memo-client may not import "@inrupt/solid-client".',
      'packages/adapters/solid-memo-client/src/rdf.test.ts: @solid-memo/solid-memo-client may not import "@inrupt/solid-client-authn-browser".',
      'packages/adapters/solid-memo-client/src/access.ts: @solid-memo/solid-memo-client may not import "@inrupt/solid-client".',
      'packages/adapters/solid-client/src/interface.ts: @solid-memo/solid-client may not import "@inrupt/solid-client".',
    ]);
  });

  it("fails on access control imported from @inrupt/solid-client outside the public-read grant", () => {
    const client = workspace(
      "inrupt-client",
      {
        "src/access.ts": 'import { universalAccess } from "@inrupt/solid-client";',
        "src/pod.ts": [
          "import {",
          "  getSolidDataset,",
          "  type AclDataset,",
          "  universalAccess as access,",
          '} from "@inrupt/solid-client";',
          'import * as solid from "@inrupt/solid-client/universal";',
        ].join("\n"),
        "src/pod.test.ts": 'import { universalAccess } from "@inrupt/solid-client";',
      },
      { "@inrupt/solid-client": "*" },
    );
    expect(problems(client)).toEqual([
      "packages/adapters/inrupt-client/src/pod.ts: may not import AclDataset from @inrupt/solid-client: only inrupt-client files matching /^src\\/access\\.ts$/ may.",
      "packages/adapters/inrupt-client/src/pod.ts: may not import universalAccess from @inrupt/solid-client: only inrupt-client files matching /^src\\/access\\.ts$/ may.",
      "packages/adapters/inrupt-client/src/pod.ts: may not import everything from @inrupt/solid-client/universal: only inrupt-client files matching /^src\\/access\\.ts$/ may.",
    ]);
  });
});

describe("the raw getters of the RDF module", () => {
  it("fail outside records.ts and the shape check, tests aside", () => {
    const rdf = "@solid-memo/solid-client/rdf";
    const solid = workspace(
      "solid",
      {
        "src/records.ts": `import { getUrlAll, eachUrl } from "${rdf}";`,
        "src/shaclShapeValidator.ts": `import { getUrlAll } from "${rdf}";`,
        "src/mappers/deckMapper.ts": [
          "import {",
          "  getThing,",
          "  getUrlAll,",
          "  type Subject,",
          "  getStringNoLocale as text,",
          `} from "${rdf}";`,
          'import { hasClass } from "../records";',
        ].join("\n"),
        "src/ownership.ts": `import * as rdf from "${rdf}.ts";`,
        "src/typeIndex.ts": `import { eachUrl, propertiesOf, getPropertyAll } from "${rdf}";`,
        "src/other.ts": 'import { getUrlAll } from "./other/rdf";',
        "src/mappers/deckMapper.test.ts": `import { getUrlAll } from "${rdf}";`,
        "src/testing/datasets.ts": `import { eachStringNoLocale } from "${rdf}";`,
      },
      { "@solid-memo/solid-client": "*" },
    );
    const only =
      "(only solid files matching /^src\\/(records\\.ts|shaclShapeValidator\\.ts)$/ may).";
    expect(problems(solid)).toEqual([
      `packages/adapters/solid/src/mappers/deckMapper.ts: may not import getUrlAll from ${rdf}: read pod data through records.ts, within its bounds ${only}`,
      `packages/adapters/solid/src/mappers/deckMapper.ts: may not import getStringNoLocale from ${rdf}: read pod data through records.ts, within its bounds ${only}`,
      `packages/adapters/solid/src/ownership.ts: may not import everything from ${rdf}.ts: read pod data through records.ts, within its bounds ${only}`,
      `packages/adapters/solid/src/typeIndex.ts: may not import eachUrl from ${rdf}: read pod data through records.ts, within its bounds ${only}`,
      `packages/adapters/solid/src/typeIndex.ts: may not import propertiesOf from ${rdf}: read pod data through records.ts, within its bounds ${only}`,
      `packages/adapters/solid/src/typeIndex.ts: may not import getPropertyAll from ${rdf}: read pod data through records.ts, within its bounds ${only}`,
    ]);
  });
});

describe("sourceFiles", () => {
  it("lists a package's TypeScript sources, build output, installs and declarations aside", () => {
    const dir = mkdtempSync(join(tmpdir(), "boundaries-"));
    for (const file of [
      "src/a.ts",
      "src/ui/B.tsx",
      "src/env.d.ts",
      "src/c.js",
      "node_modules/x/index.ts",
      "dist/a.ts",
      "coverage/a.ts",
      ".turbo/a.ts",
    ]) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), "");
    }
    expect(sourceFiles(dir).sort()).toEqual(["src/a.ts", "src/ui/B.tsx"]);
    rmSync(dir, { recursive: true });
  });
});

describe("main", () => {
  function fakeIo(workspaces: Workspace[]) {
    const logs: string[] = [];
    return {
      logs,
      workspaces: () => workspaces,
      sharedTooling: () => TOOLING,
      log: (message: string) => logs.push(message),
    };
  }

  it("says so and returns 0 when every package keeps to its boundaries", () => {
    const io = fakeIo([workspace("turtle", { "src/a.ts": 'import { it } from "./b.ts";' })]);
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual(["Every package keeps to its boundaries."]);
  });

  it("logs each problem, and how many, and returns 1", () => {
    const io = fakeIo([workspace("turtle", { "src/a.ts": 'import "zod";\nimport "nanoid";' })]);
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      "packages/lib/turtle/src/a.ts: imports zod, which package.json does not declare.",
      "packages/lib/turtle/src/a.ts: imports nanoid, which package.json does not declare.",
      "2 boundary problem(s).",
    ]);
  });
});

describe("the repository's packages", () => {
  it("keep to their boundaries", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(log.mock.calls).toEqual([["Every package keeps to its boundaries."]]);
    expect(process.exitCode).toBe(0);
    log.mockRestore();
  });

  it("are read from apps/, packages/ and e2e/, with the root's devDependencies", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    const workspaces = io.workspaces();
    const domain = workspaces.find((one) => one.dir === "packages/core/domain");
    expect(domain?.manifest.name).toBe("@solid-memo/domain");
    expect(Object.keys(domain!.files)).toContain("src/account.test.ts");
    expect(workspaces.map((one) => one.dir)).toContain("apps/web");
    expect(workspaces.map((one) => one.dir)).toContain("e2e/pod");
    expect(io.sharedTooling().has("vitest")).toBe(true);
  });
});
