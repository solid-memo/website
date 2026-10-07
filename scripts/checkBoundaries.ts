/**
 * `npm run check:boundaries`: hold every workspace package to its place in
 * the architecture (docs/architecture.md). For each import in a package:
 *
 * - a relative import stays inside the package;
 * - an import of another workspace package is one its layer may use, and
 *   the package declares it in package.json;
 * - any other package is declared too (npm hoists everything, so an
 *   undeclared import would still resolve — this is what catches it);
 * - code that runs in the browser imports nothing node-only (node:*, n3,
 *   the Turtle tooling, a package's tooling/ or node/ entry points).
 *
 * Test files and configs may also use the shared test tooling from the
 * root package.json.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Which workspace packages each may import. */
const LAYERS: Record<string, string[]> = {
  turtle: [],
  vocab: ["turtle"],
  domain: ["vocab"],
  application: ["domain", "vocab"],
  shacl: ["domain", "vocab", "turtle"],
  solid: ["application", "domain", "vocab", "shacl"],
  browser: ["application", "domain"],
  web: ["application", "domain", "vocab", "solid", "browser"],
  "e2e-pod": ["application", "domain", "vocab", "solid"],
  // The journeys drive the built app in a browser; they read only its text.
  "e2e-journeys": ["web"],
};

/** Within a package, files that alone may use some of its allowed packages. */
const ONLY_FROM: Record<string, Record<string, RegExp>> = {
  // The UI talks to use cases; only the composition root knows the adapters.
  web: { solid: /^src\/main\.tsx$/, browser: /^src\/main\.tsx$/ },
  // The generators read Turtle; the vocabulary the browser loads never does.
  vocab: { turtle: /^tooling\// },
  // The browser-side engine never needs the node tooling.
  shacl: { turtle: /^node\// },
  // The app's messages (apps/web/src/i18n), which the page objects find text by.
  "e2e-journeys": { web: /^harness\/strings\.ts$/ },
};

/** Code that ends up in the browser bundle (tests aside). */
const BROWSER: Record<string, RegExp> = {
  vocab: /^src\//,
  domain: /^src\//,
  application: /^src\//,
  shacl: /^src\//,
  solid: /^src\//,
  browser: /^src\//,
  web: /^src\//,
};
const NODE_ONLY = [/^node:/, /^n3$/, /^@solid-memo\/turtle(\/|$)/, /^@solid-memo\/[a-z-]+\/(tooling|node)\//];

const SHARED_TEST_TOOLING = new Set(Object.keys(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).devDependencies));
const isTestFile = (path: string) =>
  /\.test\.tsx?$/.test(path) || /(^|\/)(testing|test)\//.test(path) || /^(vitest(\.\w+)?\.config|globalSetup)\.ts$/.test(path);

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|^import\s+|\bvi\.mock\(\s*)["']([^"'\s]+)["']/gm;

function sourceFiles(dir: string, base = dir): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "coverage", ".turbo"].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path, base));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(relative(base, path));
  }
  return out;
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

const problems: string[] = [];
for (const group of ["apps", "packages", "e2e"]) {
  for (const folder of readdirSync(join(ROOT, group))) {
    const dir = join(ROOT, group, folder);
    const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    const short = (manifest.name as string).replace("@solid-memo/", "");
    const declared = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
    ]);
    const allowed = LAYERS[short];
    if (allowed === undefined) {
      problems.push(`${manifest.name}: not in the layer table of scripts/checkBoundaries.ts.`);
      continue;
    }
    for (const file of sourceFiles(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      const where = `${group}/${folder}/${file}`;
      const test = isTestFile(file);
      for (const [, specifier] of text.matchAll(IMPORT)) {
        if (specifier!.startsWith(".")) {
          const target = relative(dir, resolve(dir, dirname(file), specifier!));
          // Every package's vitest.config.ts shares the root's setup.
          const shared = file === "vitest.config.ts" && specifier === "../../vitest.shared.ts";
          if (target.startsWith("..") && !shared) problems.push(`${where}: "${specifier}" reaches outside the package.`);
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
          if (other !== short && !declared.has(`@solid-memo/${other}`)) {
            problems.push(`${where}: imports @solid-memo/${other}, which package.json does not declare.`);
          }
        } else {
          const name = packageName(specifier!);
          const shared = (test || file === "vite.config.ts") && SHARED_TEST_TOOLING.has(name);
          if (!declared.has(name) && !shared && !declared.has(`@types/${name}`)) {
            problems.push(`${where}: imports ${name}, which package.json does not declare.`);
          }
        }
        if (BROWSER[short]?.test(file) && !test && NODE_ONLY.some((pattern) => pattern.test(specifier!))) {
          problems.push(`${where}: runs in the browser, so may not import "${specifier}".`);
        }
      }
    }
  }
}

for (const problem of problems) console.error(problem);
console.log(problems.length === 0 ? "Every package keeps to its boundaries." : `${problems.length} boundary problem(s).`);
process.exitCode = problems.length === 0 ? 0 : 1;
