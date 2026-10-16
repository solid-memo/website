// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:boundaries`: hold every workspace package to its place in
 * the architecture (docs/architecture.md). For each import in a package:
 *
 * - a relative import stays inside the package;
 * - an import of another workspace package is one its layer may use, and
 *   the package declares it in package.json; some may be imported only
 *   from certain files, or only lazily, with a dynamic import();
 * - any other package is declared too (npm hoists everything, so an
 *   undeclared import would still resolve — this is what catches it);
 * - code that runs in the browser imports nothing node-only (node:*, n3,
 *   Mermaid and Playwright, the Turtle tooling, a package's tooling/ or
 *   node/ entry points).
 * - some exports of a vendor package may be imported only from certain
 *   files: `@inrupt/solid-client`'s access control, by the release
 *   publisher alone (docs/boundaries.md, Access control).
 *
 * Test files and configs may also use the shared test tooling from the
 * root package.json.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/** Which workspace packages each may import. */
export const LAYERS: Record<string, string[]> = {
  turtle: [],
  markdown: [],
  vocab: ["turtle"],
  domain: ["vocab"],
  application: ["domain", "vocab"],
  shacl: ["domain", "vocab", "turtle", "markdown"],
  solid: ["application", "domain", "vocab", "shacl"],
  browser: ["application", "domain"],
  // The components receive use cases and never reach solid or browser.
  ui: ["application", "domain", "vocab", "markdown"],
  // The composition root: every adapter behind its port, and the use cases over them.
  composition: ["application", "domain", "vocab", "solid", "browser"],
  // The site's page, which shows the Studio at its routes.
  web: ["application", "domain", "vocab", "ui", "composition", "studio"],
  // The Studio, a second app on the same layers as Solid Memo's, which the site's page loads.
  studio: ["application", "domain", "vocab", "ui"],
  "e2e-pod": ["application", "domain", "vocab", "solid"],
  // The journeys drive the built app in a browser; they read only its text.
  "e2e-journeys": ["ui"],
};

/** Within a package, files that alone may use some of its allowed packages. */
export const ONLY_FROM: Record<string, Record<string, RegExp>> = {
  // Only the app's entry point has the layers wired, and loads the Studio; the build test imports neither.
  web: { composition: /^src\/main\.tsx$/, studio: /^src\/main\.tsx$/ },
  // Data text is rendered by the components alone (docs/markdown.md).
  ui: { markdown: /^src\/ui\// },
  // The generators read Turtle; the vocabulary the browser loads never does.
  vocab: { turtle: /^tooling\// },
  // The browser-side engine never needs the node tooling, nor the library check's Markdown rules.
  shacl: { turtle: /^node\//, markdown: /^node\// },
  // The app's messages (packages/ui/src/i18n), which the page objects find text by.
  "e2e-journeys": { ui: /^harness\/strings\.ts$/ },
};

/**
 * Vendor exports that only certain files may import, tests aside, by
 * package (`files`); a namespace import counts as importing them all.
 * Who may read something is changed in one place only: the access
 * control of @inrupt/solid-client (universal access, ACP, the ACL
 * functions) is the release publisher's.
 */
export const VENDOR_ONLY_FROM: {
  specifier: RegExp;
  names: RegExp;
  files: Record<string, RegExp>;
}[] = [
  {
    specifier: /^@inrupt\/solid-client(\/|$)/,
    names:
      /^(universalAccess|access|acp_\w+|\w*Ac[lr]\w*|(get|set)(Agent|Group|Public)(Resource|Default)?Access(All)?|getEffectiveAccess)$/,
    files: { solid: /^src\/solidReleasePublisher\.ts$/ },
  },
];

/** A static import's specifier, and what it names: the names inside its braces, or "*" for a namespace import. */
export const NAMED_IMPORT =
  /^import\s+(?:type\s+)?(?:[\w$]+\s*,\s*)?(?:\{([^}]*)\}|(\*)\s+as\s+[\w$]+)\s*from\s*["']([^"'\s]+)["']/gm;

/** Packages a package may import only with a dynamic import(), so they stay out of its first chunk. */
export const LAZY_ONLY: Record<string, string[]> = {
  // The Studio is a chunk of its own, which a learner never downloads (docs/studio.md).
  web: ["studio"],
};

/** Code that ends up in the browser bundle (tests aside). */
export const BROWSER: Record<string, RegExp> = {
  markdown: /^src\//,
  vocab: /^src\//,
  domain: /^src\//,
  application: /^src\//,
  shacl: /^src\//,
  solid: /^src\//,
  browser: /^src\//,
  composition: /^src\//,
  ui: /^src\//,
  web: /^src\//,
  studio: /^src\//,
};
export const NODE_ONLY = [
  /^node:/,
  /^n3$/,
  // The docs' diagrams are drawn at build time, in Chromium (docs/markdown.md).
  /^mermaid(\/|$)/,
  /^playwright(\/|$)/,
  /^@solid-memo\/turtle(\/|$)/,
  /^@solid-memo\/[a-z-]+\/(tooling|node)\//,
];

/** A test file, test helper or config, which may also use the shared test tooling. */
export const isTestFile = (path: string) =>
  /\.test\.tsx?$/.test(path) ||
  /(^|\/)(testing|test)\//.test(path) ||
  /^(vitest(\.\w+)?\.config|globalSetup)\.ts$/.test(path);

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^import\s+|\bvi\.mock\(\s*)["']([^"'\s]+)["']/gm;

/** The package a specifier imports from: its scope and name, or its name. */
export function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

/** What package.json says of a workspace package that this check reads. */
export type Manifest = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** A workspace package: its folder from the root, its manifest, and its source by path. */
export type Workspace = { dir: string; manifest: Manifest; files: Record<string, string> };

/** What one source file of a workspace package imports against its boundaries. */
function fileProblems(
  workspace: Workspace,
  file: string,
  text: string,
  sharedTooling: ReadonlySet<string>,
): string[] {
  const { dir, manifest } = workspace;
  const problems: string[] = [];
  const short = manifest.name.replace("@solid-memo/", "");
  const allowed = LAYERS[short]!;
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  const where = `${dir}/${file}`;
  const test = isTestFile(file);
  for (const [statement, specifier] of text.matchAll(IMPORT)) {
    if (specifier!.startsWith(".")) {
      const target = join(dirname(file), specifier!);
      // Every package's vitest config (vitest.config.ts, and one of a task of its own) shares the root's setup.
      const shared =
        /^vitest(\.\w+)?\.config\.ts$/.test(file) && specifier === "../../vitest.shared.ts";
      if (target.startsWith("..") && !shared)
        problems.push(`${where}: "${specifier}" reaches outside the package.`);
      continue;
    }
    if (specifier!.startsWith("node:")) {
      // Builtins need no declaration; whether they may run here is checked below.
    } else if (specifier!.startsWith("@solid-memo/")) {
      const other = packageName(specifier!).replace("@solid-memo/", "");
      if (other !== short && !allowed.includes(other)) {
        problems.push(`${where}: ${manifest.name} may not import @solid-memo/${other}.`);
      }
      const only = ONLY_FROM[short]?.[other];
      if (only !== undefined && !only.test(file)) {
        problems.push(`${where}: only files matching ${only} may import @solid-memo/${other}.`);
      }
      if (LAZY_ONLY[short]?.includes(other) && !/^import\s*\(/.test(statement!)) {
        problems.push(`${where}: may import @solid-memo/${other} only with a dynamic import().`);
      }
      if (other !== short && !declared.has(`@solid-memo/${other}`)) {
        problems.push(
          `${where}: imports @solid-memo/${other}, which package.json does not declare.`,
        );
      }
    } else {
      const name = packageName(specifier!);
      const shared = (test || file === "vite.config.ts") && sharedTooling.has(name);
      if (!declared.has(name) && !shared && !declared.has(`@types/${name}`)) {
        problems.push(`${where}: imports ${name}, which package.json does not declare.`);
      }
    }
    if (
      BROWSER[short]?.test(file) &&
      !test &&
      NODE_ONLY.some((pattern) => pattern.test(specifier!))
    ) {
      problems.push(`${where}: runs in the browser, so may not import "${specifier}".`);
    }
  }
  for (const [, braces, namespace, specifier] of test ? [] : text.matchAll(NAMED_IMPORT)) {
    for (const rule of VENDOR_ONLY_FROM) {
      if (!rule.specifier.test(specifier!) || rule.files[short]?.test(file)) continue;
      const names =
        namespace !== undefined
          ? ["*"]
          : braces!.split(",").map(
              (one) =>
                one
                  .trim()
                  .replace(/^type\s+/, "")
                  .split(/\s+as\s+/)[0]!,
            );
      for (const name of names.filter((one) => one === "*" || rule.names.test(one))) {
        const only = Object.entries(rule.files)
          .map(([folder, pattern]) => `${folder} files matching ${pattern}`)
          .join(", ");
        problems.push(
          `${where}: may not import ${name === "*" ? "everything" : name} from ${specifier}: only ${only} may.`,
        );
      }
    }
  }
  return problems;
}

/**
 * What is wrong with the workspace packages' imports; none when every one
 * keeps to its boundaries. `sharedTooling` is the root package.json's
 * devDependencies, which tests and configs may use undeclared.
 */
export function boundaryProblems(
  workspaces: readonly Workspace[],
  sharedTooling: ReadonlySet<string>,
): string[] {
  return workspaces.flatMap((workspace) => {
    const short = workspace.manifest.name.replace("@solid-memo/", "");
    if (LAYERS[short] === undefined) {
      return [`${workspace.manifest.name}: not in the layer table of scripts/checkBoundaries.ts.`];
    }
    return Object.entries(workspace.files).flatMap(([file, text]) =>
      fileProblems(workspace, file, text, sharedTooling),
    );
  });
}

/** A package's TypeScript sources, as paths from its folder, build output and installs aside. */
export function sourceFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "coverage", ".turbo"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path, base));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(relative(base, path));
  }
  return out;
}

export type BoundariesIo = {
  /** Every workspace package, in apps/, packages/ and e2e/. */
  workspaces(): Workspace[];
  /** The root package.json's devDependencies. */
  sharedTooling(): Set<string>;
  log(message: string): void;
};

export function defaultIo(root: string): BoundariesIo {
  const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  return {
    workspaces: () =>
      ["apps", "packages", "e2e"].flatMap((group) =>
        readdirSync(join(root, group)).map((folder) => {
          const dir = join(root, group, folder);
          const files = sourceFiles(dir).map((file) => [
            file,
            readFileSync(join(dir, file), "utf8"),
          ]);
          return {
            dir: `${group}/${folder}`,
            manifest: json(join(dir, "package.json")) as Manifest,
            files: Object.fromEntries(files),
          };
        }),
      ),
    sharedTooling: () => new Set(Object.keys(json(join(root, "package.json")).devDependencies)),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when every package keeps to its boundaries. */
export function main(io: BoundariesIo): number {
  const problems = boundaryProblems(io.workspaces(), io.sharedTooling());
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) {
    io.log(`${problems.length} boundary problem(s).`);
    return 1;
  }
  io.log("Every package keeps to its boundaries.");
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkBoundaries.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
