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
 *   from certain files, only lazily, with a dynamic import(), or only
 *   at certain entry points;
 * - any other package is declared too (npm hoists everything, so an
 *   undeclared import would still resolve — this is what catches it);
 * - code that runs in the browser imports nothing node-only (node:*, n3,
 *   Mermaid and Playwright, the Turtle tooling, the site's build, a
 *   package's tooling/ or node/ entry points).
 * - some vendor packages may be imported only from certain files: the
 *   Solid client libraries, any `@inrupt/` package, by the client modules
 *   of the solid package and the shacl package's Turtle reader alone
 *   (docs/boundaries.md, Vendor libraries), and never, tests included, by
 *   solid-memo-client, the client that replaces them; and some exports of
 *   one only from certain files:
 *   `@inrupt/solid-client`'s access control, by the public-read grant alone
 *   (docs/boundaries.md, Access control);
 * - the raw getters of the solid package's RDF module (client/rdf.ts),
 *   which read every value of a property, by records.ts, the client
 *   modules and the shape check alone (docs/boundaries.md, Reading pod
 *   data): a mapper reads through records.ts, within the bounds of
 *   ns/bounds/.
 *
 * Test files and configs may also use the shared test tooling from the
 * root package.json.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { packageFolders } from "./packageFolders.ts";

/** Which workspace packages each may import. */
export const LAYERS: Record<string, string[]> = {
  turtle: [],
  markdown: [],
  vocab: ["turtle"],
  // The site's build, in node: it reads where the repository's folders are from vocab, and renders the docs.
  "build-tools": ["vocab", "turtle", "markdown"],
  domain: ["vocab"],
  application: ["domain", "vocab"],
  shacl: ["domain", "vocab", "turtle", "markdown"],
  // The seam between solid and a Solid client: the types and limits a client works to, and what it gives, declared.
  "solid-client": ["domain", "vocab"],
  // The Solid adapters, through the seam; never a client by name: the build puts the one SOLID_CLIENT names in place.
  solid: ["application", "domain", "vocab", "shacl", "solid-client"],
  // The two Solid clients, each the seam's declared modules over libraries of its own. No package the app is made
  // of imports either; their tests run solid's contract (scripts/solidClient.ts).
  "inrupt-client": ["solid-client", "domain", "solid"],
  "solid-memo-client": ["solid-client", "solid"],
  browser: ["application", "domain"],
  // The components receive use cases and never reach solid or browser.
  ui: ["application", "domain", "vocab", "markdown"],
  // The composition root: every adapter behind its port, and the use cases over them.
  composition: ["application", "domain", "vocab", "solid", "solid-client", "browser"],
  // The site's page, which shows the Studio at its routes; its build publishes the docs.
  web: ["application", "domain", "vocab", "ui", "composition", "studio", "build-tools"],
  // The Studio, a second app on the same layers as Solid Memo's, which the site's page loads.
  studio: ["application", "domain", "vocab", "ui"],
  "e2e-pod": ["application", "domain", "vocab", "solid", "solid-client", "solid-memo-client"],
  // The journeys drive the built app in a browser; they read only its text.
  "e2e-journeys": ["ui", "studio"],
};

/** Within a package, files that alone may use some of its allowed packages. */
export const ONLY_FROM: Record<string, Record<string, RegExp>> = {
  // Only the app's entry point has the layers wired, and loads the Studio; the build test imports neither.
  // The site is built, and its docs rendered, by the build, and checked by its tests, never in the page.
  web: {
    composition: /^src\/main\.tsx$/,
    studio: /^src\/main\.tsx$/,
    "build-tools": /^(vite\.config\.ts|src\/[^/]+\.test\.ts)$/,
  },
  // Data text is rendered by the components alone (docs/markdown.md).
  ui: { markdown: /^src\/ui\// },
  // The generators read Turtle; the vocabulary the browser loads never does.
  vocab: { turtle: /^tooling\// },
  // The browser-side engine never needs the node tooling, nor the library check's Markdown rules.
  shacl: { turtle: /^node\//, markdown: /^node\// },
  // The app's messages (packages/ui/src/i18n, apps/studio/src/i18n), which the page objects find text by.
  "e2e-journeys": { ui: /^harness\/strings\.ts$/, studio: /^harness\/strings\.ts$/ },
  // A client's tests run solid's contract on it; nothing else of it is solid's.
  "inrupt-client": { solid: /\.test\.ts$/ },
  "solid-memo-client": { solid: /\.test\.ts$/ },
  // The signed-in tests sign in to a Linked Web Storage server with the only client that can.
  "e2e-pod": { "solid-memo-client": /^signedInClient\.ts$/ },
};

/** Any entry point of application but its ports (src/ports/). */
const NO_PORT = /^@solid-memo\/application\/(?!ports\/)/;

/** Within a package, the entry points of an allowed package that alone it may import. */
export const ONLY_ENTRIES: Record<string, Record<string, RegExp>> = {
  // Where the repository's folders are; vocab's generator and data are not the site's build.
  "build-tools": { vocab: /^@solid-memo\/vocab\/tooling\/root$/ },
  // An adapter implements its own ports alone: the browser's are those of what the device keeps.
  browser: { application: /^@solid-memo\/application\/ports\/device$/ },
  // The screens drive the use cases and never name a port (docs/boundaries.md#further-rules).
  ui: { application: NO_PORT },
  studio: { application: NO_PORT },
  web: { application: NO_PORT },
};

/**
 * Vendor packages that only certain files may import, tests aside, by
 * package (`files`), with any import. The Solid client libraries, any
 * `@inrupt/` package, are inrupt-client's alone, the modules
 * packages/adapters/solid-client declares, so another client takes their place
 * (docs/vendor-code.md); shacl, which may not import solid, reads Turtle
 * through one module of its own. The JSON-LD parser, which must be
 * given a document loader that fetches nothing, is one module's alone in
 * each client: resources.ts.
 */
export const VENDOR_ONLY_IN: { specifier: RegExp; files: Record<string, RegExp> }[] = [
  {
    specifier: /^@inrupt\//,
    files: { "inrupt-client": /^src\//, shacl: /^src\/turtleDocument\.ts$/ },
  },
  {
    specifier: /^jsonld-streaming-parser$/,
    files: { "inrupt-client": /^src\/resources\.ts$/, "solid-memo-client": /^src\/resources\.ts$/ },
  },
];

/**
 * Vendor packages a package never imports, tests and configs included:
 * solid-memo-client is the Solid client without Inrupt's libraries, and
 * the seam names no client's library.
 */
export const VENDOR_NEVER_IN: Record<string, RegExp> = {
  "solid-memo-client": /^@inrupt\//,
  "solid-client": /^@inrupt\//,
};

/**
 * Vendor exports that only certain files may import, tests aside, by
 * package (`files`); a namespace import counts as importing them all.
 * Who may read something is changed in one place only: the access
 * control of @inrupt/solid-client (universal access, ACP, the ACL
 * functions) is the public-read grant's, which the release publisher is
 * given.
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
    files: { "inrupt-client": /^src\/access\.ts$/ },
  },
];

/**
 * The raw getters of the app's RDF module (packages/adapters/solid-client/src/rdf.ts):
 * each reads a property's values, every one of them, with no bound
 * (getUrlAll, getStringNoLocale, getTermAll, getPropertyAll,
 * propertiesOf, and the readers one at a time, eachUrl and its
 * siblings). Outside data is read through records.ts, whose readers
 * keep to the bounds of ns/bounds/ (docs/shapes.md, Bounds).
 */
export const RAW_GETTERS =
  /^(get(Url|Iri|StringNoLocale|StringWithLocale|StringByLocale|StringEnglish|Literal|Term|NamedNode|Integer|Decimal|Boolean|Datetime|Date|Time)(All)?|getPropertyAll|propertiesOf|each[A-Z]\w*)$/;

/**
 * The module whose raw getters RAW_GETTERS names, by package, as the
 * specifier it is imported by, and the files that may import them, tests
 * aside: records.ts, which reads every record and term within its
 * bounds, and the shape check, which judges a whole document as SHACL
 * does and reads nothing into the app's models. The clients make the
 * getters, and read what a server says of a resource with them.
 */
export const RAW_GETTERS_ONLY_IN: Record<string, { module: string; files: RegExp }> = {
  solid: {
    module: "@solid-memo/solid-client/rdf",
    files: /^src\/(records\.ts|shaclShapeValidator\.ts)$/,
  },
};

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
  "solid-client": /^src\//,
  "inrupt-client": /^src\//,
  "solid-memo-client": /^src\//,
};

/**
 * The node-only packages a package's browser code may import all the
 * same, from the files given: solid-memo-client reads and writes Turtle
 * with n3, which Inrupt's client bundles too, and inrupt-client's
 * linearDataset.ts builds the parser Inrupt's library reads Turtle
 * with, without triple terms, and the terms of a dataset's quads.
 */
export const BROWSER_MAY_USE: Record<string, { specifier: RegExp; files: RegExp }> = {
  "solid-memo-client": { specifier: /^n3$/, files: /^src\// },
  "inrupt-client": { specifier: /^n3$/, files: /^src\/linearDataset\.ts$/ },
};

/** Whether BROWSER_MAY_USE lets this file of a package's browser code import `specifier`. */
const browserMayUse = (short: string, file: string, specifier: string) => {
  const may = BROWSER_MAY_USE[short];
  return may !== undefined && may.specifier.test(specifier) && may.files.test(file);
};

export const NODE_ONLY = [
  /^node:/,
  /^n3$/,
  // The docs' diagrams are drawn at build time, in Chromium (docs/markdown.md).
  /^mermaid(\/|$)/,
  /^playwright(\/|$)/,
  /^@solid-memo\/turtle(\/|$)/,
  /^@solid-memo\/build-tools(\/|$)/,
  /^@solid-memo\/[a-z-]+\/(tooling|node)\//,
];

/**
 * The root's shared setup, which a package's Vite and Vitest configs may
 * import, as paths from the root: the test setup and the Solid client
 * switch.
 */
const SHARED_SETUP = new Set(["vitest.shared.ts", "scripts/solidClient.ts"]);

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

/**
 * What one import of another workspace package, `other`, breaks (fileProblems):
 * its layer may not use it, only some files or only a dynamic import() may,
 * it may use other entry points only, or package.json does not declare it.
 */
function workspaceImportProblems(
  where: string,
  name: string,
  file: string,
  statement: string,
  specifier: string,
  other: string,
  declared: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const short = name.replace("@solid-memo/", "");
  if (other !== short && !LAYERS[short]!.includes(other)) {
    problems.push(`${where}: ${name} may not import @solid-memo/${other}.`);
  }
  const only = ONLY_FROM[short]?.[other];
  if (only !== undefined && !only.test(file)) {
    problems.push(`${where}: only files matching ${only} may import @solid-memo/${other}.`);
  }
  const entries = ONLY_ENTRIES[short]?.[other];
  if (entries !== undefined && !entries.test(specifier)) {
    problems.push(
      `${where}: may import only ${entries} of @solid-memo/${other}, not "${specifier}".`,
    );
  }
  if (LAZY_ONLY[short]?.includes(other) && !/^import\s*\(/.test(statement)) {
    problems.push(`${where}: may import @solid-memo/${other} only with a dynamic import().`);
  }
  if (other !== short && !declared.has(`@solid-memo/${other}`)) {
    problems.push(`${where}: imports @solid-memo/${other}, which package.json does not declare.`);
  }
  return problems;
}

/** Which files a vendor rule allows, by package, for a problem's text. */
const onlyFiles = (files: Record<string, RegExp>) =>
  Object.entries(files)
    .map(([folder, pattern]) => `${folder} files matching ${pattern}`)
    .join(", ");

/** Whether VENDOR_ONLY_IN keeps `specifier` from this file, which fileProblems reports already. */
const keptOut = (short: string, file: string, specifier: string) =>
  VENDOR_ONLY_IN.some((rule) => rule.specifier.test(specifier) && !rule.files[short]?.test(file));

/**
 * The vendor exports a file imports that VENDOR_ONLY_FROM keeps to other
 * files (fileProblems); none of a package the file may not import at all,
 * reported once already.
 */
function vendorImportProblems(where: string, short: string, file: string, text: string): string[] {
  const problems: string[] = [];
  for (const [, braces, namespace, specifier] of text.matchAll(NAMED_IMPORT)) {
    if (keptOut(short, file, specifier!)) continue;
    for (const rule of VENDOR_ONLY_FROM) {
      if (!rule.specifier.test(specifier!) || rule.files[short]?.test(file)) continue;
      const names = importedNames(braces, namespace);
      for (const name of names.filter((one) => one === "*" || rule.names.test(one))) {
        problems.push(
          `${where}: may not import ${name === "*" ? "everything" : name} from ${specifier}: only ${onlyFiles(rule.files)} may.`,
        );
      }
    }
  }
  return problems;
}

/**
 * What one import of a vendor package breaks (fileProblems): the package
 * may never import it (VENDOR_NEVER_IN), or only other files may
 * (VENDOR_ONLY_IN), tests aside.
 */
function vendorPackageProblems(
  where: string,
  name: string,
  file: string,
  specifier: string,
): string[] {
  const short = name.replace("@solid-memo/", "");
  if (VENDOR_NEVER_IN[short]?.test(specifier)) {
    return [`${where}: ${name} may not import "${specifier}".`];
  }
  const vendor = VENDOR_ONLY_IN.find((rule) => rule.specifier.test(specifier));
  if (vendor === undefined || isTestFile(file) || vendor.files[short]?.test(file)) return [];
  return [`${where}: may not import "${specifier}": only ${onlyFiles(vendor.files)} may.`];
}

/** The names a static import names (NAMED_IMPORT): "*" for a namespace import, each name without `type` or its alias. */
function importedNames(braces: string | undefined, namespace: string | undefined): string[] {
  if (namespace !== undefined) return ["*"];
  return braces!.split(",").map(
    (one) =>
      one
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]!,
  );
}

/**
 * The raw getters a file imports that RAW_GETTERS_ONLY_IN keeps to
 * other files of its package (fileProblems), tests aside.
 */
function rawGetterProblems(where: string, short: string, file: string, text: string): string[] {
  const rule = RAW_GETTERS_ONLY_IN[short];
  if (rule === undefined || rule.files.test(file)) return [];
  const problems: string[] = [];
  for (const [, braces, namespace, specifier] of text.matchAll(NAMED_IMPORT)) {
    if (specifier!.replace(/\.ts$/, "") !== rule.module) continue;
    for (const name of importedNames(braces, namespace)) {
      if (name !== "*" && !RAW_GETTERS.test(name)) continue;
      problems.push(
        `${where}: may not import ${name === "*" ? "everything" : name} from ${specifier}: read pod data through records.ts, within its bounds (only ${short} files matching ${rule.files} may).`,
      );
    }
  }
  return problems;
}

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
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ]);
  const where = `${dir}/${file}`;
  const test = isTestFile(file);
  for (const [statement, specifier] of text.matchAll(IMPORT)) {
    if (specifier!.startsWith(".")) {
      const target = join(dirname(file), specifier!);
      // Every package's configs (vite.config.ts, vitest.config.ts, one of a task of its own) share the root's setup.
      const shared =
        /^vite(st(\.\w+)?)?\.config\.ts$/.test(file) &&
        SHARED_SETUP.has(join(dir, dirname(file), specifier!));
      if (target.startsWith("..") && !shared)
        problems.push(`${where}: "${specifier}" reaches outside the package.`);
      continue;
    }
    if (specifier!.startsWith("node:")) {
      // Builtins need no declaration; whether they may run here is checked below.
    } else if (specifier!.startsWith("@solid-memo/")) {
      const other = packageName(specifier!).replace("@solid-memo/", "");
      problems.push(
        ...workspaceImportProblems(
          where,
          manifest.name,
          file,
          statement!,
          specifier!,
          other,
          declared,
        ),
      );
    } else {
      const name = packageName(specifier!);
      const shared = (test || file === "vite.config.ts") && sharedTooling.has(name);
      if (!declared.has(name) && !shared && !declared.has(`@types/${name}`)) {
        problems.push(`${where}: imports ${name}, which package.json does not declare.`);
      }
    }
    problems.push(...vendorPackageProblems(where, manifest.name, file, specifier!));
    if (
      BROWSER[short]?.test(file) &&
      !test &&
      NODE_ONLY.some((pattern) => pattern.test(specifier!)) &&
      !browserMayUse(short, file, specifier!)
    ) {
      problems.push(`${where}: runs in the browser, so may not import "${specifier}".`);
    }
  }
  if (!test) problems.push(...vendorImportProblems(where, short, file, text));
  if (!test) problems.push(...rawGetterProblems(where, short, file, text));
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
  const dirs = new Map(
    workspaces.map((workspace) => [
      workspace.manifest.name.replace("@solid-memo/", ""),
      workspace.dir,
    ]),
  );
  return workspaces.flatMap((workspace) => {
    const short = workspace.manifest.name.replace("@solid-memo/", "");
    if (LAYERS[short] === undefined) {
      return [`${workspace.manifest.name}: not in the layer table of scripts/checkBoundaries.ts.`];
    }
    return [
      ...folderProblems(workspace.dir, LAYERS[short], dirs),
      ...Object.entries(workspace.files).flatMap(([file, text]) =>
        fileProblems(workspace, file, text, sharedTooling),
      ),
    ];
  });
}

/**
 * The folders that group packages by their role, each with the folders
 * its packages may import from (docs/architecture.md): the core, the
 * rules and the use cases with their ports, builds on the libraries
 * alone, and a library on other libraries alone.
 */
export const ROLE_FOLDERS: Record<string, string[]> = {
  core: ["core", "lib"],
  lib: ["lib"],
};

/** The packages that may import an adapter: the adapters, the composition root, and the end-to-end tests. */
const ADAPTER_IMPORTERS = /^(packages\/adapters\/|packages\/composition$|e2e\/)/;

/** The folder that groups the package in `dir` by its role; none for one at the top of its group. */
const roleOf = (dir: string) => /^packages\/(core|adapters|lib)\//.exec(dir)?.[1];

/**
 * What the layer table lets the package in `dir` import against the
 * folders it and they are in: a package of a role folder only what that
 * folder's packages may, and an adapter only from the adapters, the
 * composition root and the end-to-end tests.
 */
function folderProblems(
  dir: string,
  allowed: readonly string[],
  dirs: Map<string, string>,
): string[] {
  const own = roleOf(dir);
  return allowed.flatMap((other) => {
    const otherDir = dirs.get(other);
    if (otherDir === undefined) return [];
    const theirs = roleOf(otherDir);
    const may = own === undefined ? undefined : ROLE_FOLDERS[own];
    if (may !== undefined && (theirs === undefined || !may.includes(theirs))) {
      return [
        `${dir}: a package in packages/${own}/ may import only packages in ${may.map((folder) => `packages/${folder}/`).join(", ")}, not @solid-memo/${other} (${otherDir}).`,
      ];
    }
    if (theirs === "adapters" && !ADAPTER_IMPORTERS.test(dir)) {
      return [
        `${dir}: only the adapters, the composition root and the end-to-end tests may import an adapter, not @solid-memo/${other} (${otherDir}).`,
      ];
    }
    return [];
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
        packageFolders(root, group).map((folder) => {
          const dir = join(root, folder);
          const files = sourceFiles(dir).map((file) => [
            file,
            readFileSync(join(dir, file), "utf8"),
          ]);
          return {
            dir: folder,
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
