// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:exports`: every export of the apps' and packages' code
 * is used by code that is not a test. Coverage cannot tell: an export
 * that only its own test calls is covered all the same, though nothing
 * runs it (docs/testing.md, Coverage). An export is used when:
 *
 * - another file imports it, re-exports it, or imports its module whole
 *   (`import * as`, `export *`, a dynamic `import()`), tests aside;
 * - its own file uses it too (it is exported for a test to reach, and
 *   runs all the same);
 * - a package.json script calls it (`import('…').then((m) => m.run(…))`).
 *
 * Tests are the test files, helpers and configs of checkBoundaries.ts
 * (isTestFile), and the end-to-end tests in e2e/. Default exports (a
 * config's, a lazily loaded module's) and the generated files, which
 * describe the vocabulary whole, are not checked.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";
import { parseSync } from "vite";
import { isTestFile, sourceFiles } from "./checkBoundaries.ts";

/** A workspace package: its folder from the root, its manifest, and its source by path. */
export type Package = {
  dir: string;
  manifest: {
    name: string;
    exports?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  files: Record<string, string>;
};

/** What a file exports, by name, with whether its own code uses it. */
type Exported = Map<string, boolean>;

/** What one module says of its imports and exports. */
type ModuleRecord = {
  imports: { specifier: string; names: string[] | "*" }[];
  exports: Exported;
};

/** Identifiers that name something other than a binding of the file: a property, a key, a label. */
const NOT_A_REFERENCE: Record<string, string[]> = {
  MemberExpression: ["property"],
  Property: ["key"],
  PropertyDefinition: ["key"],
  MethodDefinition: ["key"],
  TSPropertySignature: ["key"],
  TSMethodSignature: ["key"],
  TSEnumMember: ["id"],
  TSQualifiedName: ["right"],
  JSXAttribute: ["name"],
  JSXMemberExpression: ["property"],
  LabeledStatement: ["label"],
  BreakStatement: ["label"],
  ContinueStatement: ["label"],
  ExportSpecifier: ["local", "exported"],
  ImportSpecifier: ["local", "imported"],
  ImportDefaultSpecifier: ["local"],
  ImportNamespaceSpecifier: ["local"],
};

/** Declarations whose `id` binds the name they declare. */
const DECLARES = new Set([
  "VariableDeclarator",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "ClassDeclaration",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
]);

/** The names the code refers to, each as often as it does, declarations and property names aside. */
function references(program: unknown): Map<string, number> {
  const counts = new Map<string, number>();
  const visit = (node: unknown, parent: string | null, key: string | null): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parent, key);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const { type } = node as { type?: unknown };
    if (type === "Identifier" || type === "JSXIdentifier") {
      const { name, computed } = node as { name: string; computed?: boolean };
      const skipped =
        (parent !== null && key !== null && NOT_A_REFERENCE[parent]?.includes(key)) ||
        (parent !== null && key === "id" && DECLARES.has(parent));
      if (!skipped && computed !== true) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const here = typeof type === "string" ? type : parent;
    const shorthand = (node as { shorthand?: boolean }).shorthand === true;
    const computed = (node as { computed?: boolean }).computed === true;
    for (const [child, value] of Object.entries(node)) {
      if (child === "type") continue;
      // `{ name }` is a key and a reference both, and `a[name]` or `{ [name]: … }` a reference.
      const as =
        (shorthand || computed) && (child === "key" || child === "property") ? null : child;
      visit(value, here, as);
    }
  };
  visit(program, null, null);
  return counts;
}

/** What the module at `file` imports and exports; `text` is its source. */
export function moduleRecord(file: string, text: string): ModuleRecord {
  const { module, program } = parseSync(file, text);
  const used = references(program);
  const imports: ModuleRecord["imports"] = [];
  const exports: Exported = new Map();
  for (const { moduleRequest, entries } of module.staticImports) {
    const whole = entries.some(({ importName }) => importName.kind === "NamespaceObject");
    const names = entries.flatMap(({ importName }) =>
      importName.kind === "Name" ? [importName.name!] : [],
    );
    imports.push({ specifier: moduleRequest.value, names: whole ? "*" : names });
  }
  for (const { entries } of module.staticExports) {
    for (const { moduleRequest, importName, exportName, localName } of entries) {
      if (moduleRequest !== null) {
        imports.push({
          specifier: moduleRequest.value,
          names: importName.kind === "Name" ? [importName.name!] : "*",
        });
      }
      if (exportName.kind !== "Name") continue;
      const local = localName.kind === "Name" ? localName.name! : null;
      exports.set(exportName.name!, local !== null && (used.get(local) ?? 0) > 0);
    }
  }
  for (const { moduleRequest } of module.dynamicImports) {
    const specifier = /^["'`]([^"'`$]+)["'`]$/.exec(
      text.slice(moduleRequest.start, moduleRequest.end),
    );
    if (specifier !== null) imports.push({ specifier: specifier[1]!, names: "*" });
  }
  return { imports, exports };
}

/** The file a package export subpath (`./x`, or `./*`'s match) names, from the root. */
function exportTarget(pkg: Package, subpath: string): string | null {
  for (const [pattern, target] of Object.entries(pkg.manifest.exports ?? {})) {
    if (pattern === subpath) return join(pkg.dir, target);
    const star = pattern.indexOf("*");
    if (
      star >= 0 &&
      subpath.startsWith(pattern.slice(0, star)) &&
      subpath.endsWith(pattern.slice(star + 1))
    ) {
      const match = subpath.slice(star, subpath.length - (pattern.length - star - 1));
      return join(pkg.dir, target.replace("*", match));
    }
  }
  return null;
}

/** The source file, from the root, that `specifier` imports from `from`; null for a vendor's. */
export function resolveImport(
  specifier: string,
  from: string,
  packages: readonly Package[],
  exists: (file: string) => boolean,
): string | null {
  const bare = specifier.replace(/\?.*$/, "");
  let base: string | null = null;
  if (bare.startsWith(".")) base = normalize(join(dirname(from), bare));
  else {
    const pkg = packages.find(
      ({ manifest }) => bare === manifest.name || bare.startsWith(`${manifest.name}/`),
    );
    if (pkg !== undefined) base = exportTarget(pkg, `.${bare.slice(pkg.manifest.name.length)}`);
  }
  if (base === null) return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  return candidates.find(exists) ?? null;
}

/** What a package's scripts import, as a module's imports: `import('<specifier>').then((m) => m.<name>(…))`. */
function scriptImports(pkg: Package): ModuleRecord["imports"] {
  const entry = /import\('([^']+)'\)\.then\(\(m\) => m\.([\w$]+)\(/g;
  return Object.values(pkg.manifest.scripts ?? {}).flatMap((script) =>
    [...script.matchAll(entry)].map(([, specifier, name]) => ({
      specifier: specifier!,
      names: [name!],
    })),
  );
}

/** Whether a file of the package in `dir` is test code, whose imports keep nothing in use. */
export function isTest(dir: string, file: string): boolean {
  return dir.startsWith("e2e/") || isTestFile(file);
}

/** The exports nothing but tests uses, as `<file>: <name>` lines from the root. */
export function unusedExports(packages: readonly Package[]): string[] {
  const sources = new Map<string, string>();
  const tests = new Set<string>();
  for (const pkg of packages) {
    for (const [file, text] of Object.entries(pkg.files)) {
      const path = join(pkg.dir, file);
      sources.set(path, text);
      if (isTest(pkg.dir, file)) tests.add(path);
    }
  }
  const records = new Map<string, ModuleRecord>();
  for (const [file, text] of sources) records.set(file, moduleRecord(file, text));
  const used = new Map<string, Set<string> | "*">();
  const use = (file: string, names: string[] | "*") => {
    const before = used.get(file);
    if (before === "*") return;
    if (names === "*") used.set(file, "*");
    else used.set(file, new Set([...(before ?? []), ...names]));
  };
  const importers = [
    ...[...records]
      .filter(([file]) => !tests.has(file))
      .map(([file, { imports }]) => ({ file, imports })),
    // A package's scripts import from its folder, as a file there would.
    ...packages.map((pkg) => ({
      file: join(pkg.dir, "package.json"),
      imports: scriptImports(pkg),
    })),
  ];
  for (const { file, imports } of importers) {
    for (const { specifier, names } of imports) {
      const target = resolveImport(specifier, file, packages, (path) => sources.has(path));
      if (target !== null) use(target, names);
    }
  }
  const problems: string[] = [];
  for (const [file, { exports }] of records) {
    if (tests.has(file) || /\.generated\.ts$/.test(file)) continue;
    const imported = used.get(file);
    for (const [name, usedHere] of exports) {
      if (usedHere || imported === "*" || imported?.has(name)) continue;
      problems.push(`${file}: ${name}`);
    }
  }
  return problems.sort();
}

export type ExportsIo = { packages(): Package[]; log(message: string): void };

export function defaultIo(root: string): ExportsIo {
  return {
    packages: () => {
      const read = (dir: string, files: string[]): Package => ({
        dir,
        manifest: JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8")),
        files: Object.fromEntries(
          files.map((file) => [file, readFileSync(join(root, dir, file), "utf8")]),
        ),
      });
      const workspaces = ["apps", "packages", "e2e"].flatMap((group) =>
        readdirSync(join(root, group)).map((folder) => {
          const dir = join(group, folder);
          return read(dir, sourceFiles(join(root, dir)));
        }),
      );
      // The repository's own checks, which the root package.json runs.
      const scripts = sourceFiles(join(root, "scripts")).map((file) => join("scripts", file));
      return [...workspaces, read(".", scripts)];
    },
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when code that is not a test uses every export. */
export function main(io: ExportsIo): number {
  const problems = unusedExports(io.packages());
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) {
    io.log(
      `${problems.length} export(s) nothing but tests uses: remove each with its tests, or use it.`,
    );
    return 1;
  }
  io.log("Code that is not a test uses every export.");
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkExports.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
