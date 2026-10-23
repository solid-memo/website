// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  boundaryProblems,
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
function workspace(
  name: string,
  files: Record<string, string>,
  dependencies: Record<string, string> = {},
): Workspace {
  return {
    dir: `packages/${name}`,
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

  it("fails on a relative import that leaves the package, a vitest config's shared setup aside", () => {
    expect(
      problems(
        workspace("turtle", {
          "src/a.ts": 'import { b } from "../../domain/src/b.ts";\nimport { c } from "./c.ts";',
          "src/deep/d.ts": 'import { e } from "../e.ts";',
          "vitest.config.ts": 'import { packageConfig } from "../../vitest.shared.ts";',
          "tooling/x.ts": 'import { y } from "../../vitest.shared.ts";',
        }),
      ),
    ).toEqual([
      'packages/turtle/src/a.ts: "../../domain/src/b.ts" reaches outside the package.',
      'packages/turtle/tooling/x.ts: "../../vitest.shared.ts" reaches outside the package.',
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
      "packages/domain/src/a.ts: @solid-memo/domain may not import @solid-memo/solid.",
      "packages/domain/src/a.ts: imports @solid-memo/vocab, which package.json does not declare.",
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
      "packages/vocab/src/index.ts: only files matching /^tooling\\// may import @solid-memo/turtle.",
      'packages/vocab/src/index.ts: runs in the browser, so may not import "@solid-memo/turtle".',
    ]);
  });

  it("lets the site's build and its test render the docs, and nothing in its page", () => {
    const web = {
      ...workspace(
        "web",
        {
          "vite.config.ts":
            'import { docsSitePlugin } from "@solid-memo/markdown/tooling/publishDocs";',
          "src/build.test.ts": 'import { checkSvg } from "@solid-memo/markdown/tooling/diagrams";',
          "src/App.tsx": 'import { parseMarkdown } from "@solid-memo/markdown/parse";',
        },
        { "@solid-memo/markdown": "*" },
      ),
      dir: "apps/web",
    };
    expect(problems(web)).toEqual([
      "apps/web/src/App.tsx: only files matching /^(vite\\.config\\.ts|src\\/build\\.test\\.ts)$/ may import @solid-memo/markdown.",
    ]);
  });

  it("lets the site's config and tests use its build, and nothing in its page", () => {
    const web = {
      ...workspace(
        "web",
        {
          "vite.config.ts": 'import { siteMapPlugin } from "@solid-memo/site/siteMap";',
          "src/aboutPage.test.ts": 'import { siteOrigin } from "@solid-memo/site/siteMap";',
          "src/App.tsx": 'import { siteOrigin } from "@solid-memo/site/siteMap";',
        },
        { "@solid-memo/site": "*" },
      ),
      dir: "apps/web",
    };
    expect(problems(web)).toEqual([
      "apps/web/src/App.tsx: only files matching /^(vite\\.config\\.ts|src\\/[^/]+\\.test\\.ts)$/ may import @solid-memo/site.",
      'apps/web/src/App.tsx: runs in the browser, so may not import "@solid-memo/site/siteMap".',
    ]);
  });

  it("fails on an entry point of a package other than those the importer may use", () => {
    expect(
      problems(
        workspace(
          "site",
          {
            "src/siteBuild.ts": 'import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";',
            "src/siteMap.ts": 'import { run } from "@solid-memo/vocab/tooling/generate";',
          },
          { "@solid-memo/vocab": "*" },
        ),
      ),
    ).toEqual([
      'packages/site/src/siteMap.ts: may import only /^@solid-memo\\/vocab\\/tooling\\/root$/ of @solid-memo/vocab, not "@solid-memo/vocab/tooling/generate".',
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
      "packages/turtle/src/a.ts: imports zod, which package.json does not declare.",
      "packages/turtle/src/a.ts: imports vitest, which package.json does not declare.",
      "packages/turtle/src/a.test.ts: imports zod, which package.json does not declare.",
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
      'packages/shacl/src/a.ts: runs in the browser, so may not import "node:fs".',
      'packages/shacl/src/a.ts: runs in the browser, so may not import "n3".',
      'packages/shacl/src/a.ts: runs in the browser, so may not import "@solid-memo/vocab/tooling/load".',
      'packages/shacl/src/a.ts: runs in the browser, so may not import "playwright".',
      'packages/shacl/src/a.ts: runs in the browser, so may not import "mermaid/dist/mermaid.core.mjs".',
    ]);
  });

  it("fails on access control imported from @inrupt/solid-client outside the release publisher", () => {
    const solid = workspace(
      "solid",
      {
        "src/solidReleasePublisher.ts": 'import { universalAccess } from "@inrupt/solid-client";',
        "src/solidPod.ts": [
          "import {",
          "  getSolidDataset,",
          "  type AclDataset,",
          "  universalAccess as access,",
          '} from "@inrupt/solid-client";',
          'import * as solid from "@inrupt/solid-client/universal";',
        ].join("\n"),
        "src/solidPod.test.ts": 'import { universalAccess } from "@inrupt/solid-client";',
      },
      { "@inrupt/solid-client": "*" },
    );
    expect(problems(solid)).toEqual([
      "packages/solid/src/solidPod.ts: may not import AclDataset from @inrupt/solid-client: only solid files matching /^src\\/solidReleasePublisher\\.ts$/ may.",
      "packages/solid/src/solidPod.ts: may not import universalAccess from @inrupt/solid-client: only solid files matching /^src\\/solidReleasePublisher\\.ts$/ may.",
      "packages/solid/src/solidPod.ts: may not import everything from @inrupt/solid-client/universal: only solid files matching /^src\\/solidReleasePublisher\\.ts$/ may.",
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
      "packages/turtle/src/a.ts: imports zod, which package.json does not declare.",
      "packages/turtle/src/a.ts: imports nanoid, which package.json does not declare.",
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
    const domain = workspaces.find((one) => one.dir === "packages/domain");
    expect(domain?.manifest.name).toBe("@solid-memo/domain");
    expect(Object.keys(domain!.files)).toContain("src/account.test.ts");
    expect(workspaces.map((one) => one.dir)).toContain("apps/web");
    expect(workspaces.map((one) => one.dir)).toContain("e2e/pod");
    expect(io.sharedTooling().has("vitest")).toBe(true);
  });
});
