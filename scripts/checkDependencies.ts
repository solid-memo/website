// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * `npm run check:dependencies`: the app ships only released versions of
 * other code (docs/vendor-code.md#maturity). It walks package-lock.json
 * from the app the site serves (apps/web, which loads apps/studio), and
 * from the Solid client a build may put in place of Inrupt's
 * (packages/solid-memo-client, scripts/solidClient.ts), over
 * what each package needs at run time (`dependencies`, the
 * `optionalDependencies` npm installed, and the `peerDependencies` not
 * marked optional), and fails on a version before 1.0.0 or with a
 * prerelease tag (`-alpha`, `-beta`, `-rc`, ...). The workspace's own
 * packages are walked through, not judged. Development tools (a
 * package's `devDependencies`) are not shipped and not walked.
 *
 * The exceptions are ALLOWED, each with its reason, and each must be
 * named in docs/vendor-code.md and still be shipped, so the list and the
 * page cannot drift from what the app is made of.
 *
 * It also checks how every package is installed (docs/vendor-code.md#installing):
 * the root .npmrc turns install scripts off, every package in the
 * lockfile comes from the npm registry with its integrity hash, and none
 * but the ones in INSTALL_SCRIPTS asks to run a script when installed;
 * each of those must be named in docs/vendor-code.md and still ask.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** What package-lock.json says of one installed package (lockfileVersion 3). */
export type LockEntry = {
  name?: string;
  version?: string;
  link?: boolean;
  resolved?: string;
  integrity?: string;
  hasInstallScript?: boolean;
  inBundle?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export type Lockfile = { packages: Record<string, LockEntry> };

/** The workspace packages whose run-time dependencies are shipped. */
export const SHIPPED = ["apps/web", "packages/solid-memo-client"];

/** The unready versions the app may ship, and why (docs/vendor-code.md#maturity). */
export const ALLOWED: Record<string, string> = {
  "rdf-validate-shacl":
    "The SHACL engine the app uses, maintained by Zazuko, behind the ShapeEngine interface; shacl-engine 1.x brings in 0.x packages of its own.",
  "rdf-validate-datatype": "rdf-validate-shacl's check of literals, by the same maintainers.",
  "@inrupt/solid-client-errors": "Part of @inrupt/solid-client 4, released with it by Inrupt.",
  process:
    "The browser's stand-in for Node's process, which readable-stream asks for; final at 0.11.",
};

/** The packages that ask to run a script when installed, and why that is no loss with scripts off. */
export const INSTALL_SCRIPTS: Record<string, string> = {
  fsevents:
    "File watching on macOS, an optional dependency of Vite and others; its package carries the binary built, which its script only builds again.",
};

/** Where every package in the lockfile comes from. */
const REGISTRY = "https://registry.npmjs.org/";

/** What is wrong with how the lockfile's packages are installed; none when the check passes. */
export function installProblems(
  lock: Lockfile,
  npmrc: string,
  installScripts: Record<string, string>,
  vendorDoc: string,
): string[] {
  const problems: string[] = [];
  const withScripts = new Set<string>();
  // npm reads the last `ignore-scripts` of the file, spaces around `=` or not.
  const ignoreScripts = npmrc
    .split("\n")
    .map((line) => /^\s*ignore-scripts\s*=(.*)$/.exec(line)?.[1]?.trim())
    .filter((value) => value !== undefined);
  if (ignoreScripts.at(-1) !== "true") {
    problems.push(".npmrc: does not say `ignore-scripts=true`, so `npm ci` runs install scripts.");
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    // The workspace's own packages, links to them, and what a package
    // carries inside its own tarball are not fetched on their own.
    if (!location.includes("node_modules/") || entry.link === true || entry.inBundle === true) {
      continue;
    }
    const name =
      entry.name ?? location.slice(location.lastIndexOf("node_modules/") + "node_modules/".length);
    if (!entry.resolved?.startsWith(REGISTRY)) {
      problems.push(`${location}: resolved from ${entry.resolved}, not from ${REGISTRY}.`);
    }
    if (entry.integrity === undefined) {
      problems.push(`${location}: no integrity hash.`);
    }
    if (entry.hasInstallScript === true) withScripts.add(name);
    if (entry.hasInstallScript === true && !(name in installScripts)) {
      problems.push(
        `${location}: has an install script, which does not run: depend on another package, or add it to INSTALL_SCRIPTS in scripts/checkDependencies.ts.`,
      );
    }
  }
  for (const name of Object.keys(installScripts)) {
    if (!withScripts.has(name)) {
      problems.push(
        `${name}: in INSTALL_SCRIPTS in scripts/checkDependencies.ts, but no package of that name has an install script; take it off.`,
      );
    }
    if (!vendorDoc.includes(`\`${name}\``)) {
      problems.push(
        `${name}: in INSTALL_SCRIPTS in scripts/checkDependencies.ts, but docs/vendor-code.md does not name it.`,
      );
    }
  }
  return problems;
}

/** A version before 1.0.0, or one with a prerelease tag. */
export function isUnready(version: string): boolean {
  return version.startsWith("0.") || version.includes("-");
}

/** Where npm put a package that the package at `from` asks for, as node resolves it. */
function locate(lock: Lockfile, from: string, name: string): string | undefined {
  for (let dir = from; ; ) {
    const location = `${dir === "" ? "" : `${dir}/`}node_modules/${name}`;
    if (lock.packages[location]) return location;
    if (dir === "") return undefined;
    const nested = dir.lastIndexOf("/node_modules/");
    dir = nested === -1 ? "" : dir.slice(0, nested);
  }
}

/** The names a package needs at run time, each with whether it may be missing. */
function needs(entry: LockEntry): [string, boolean][] {
  const optionalPeers = entry.peerDependenciesMeta ?? {};
  return [
    ...Object.keys(entry.dependencies ?? {}).map((name): [string, boolean] => [name, false]),
    ...Object.keys(entry.optionalDependencies ?? {}).map((name): [string, boolean] => [name, true]),
    ...Object.keys(entry.peerDependencies ?? {}).map((name): [string, boolean] => [
      name,
      optionalPeers[name]?.optional === true,
    ]),
  ];
}

/** A shipped package: its name, version, and the chain of packages that asked for it. */
export type Shipped = { name: string; version: string; via: string[] };

/** Every third-party package the roots ship, and every dependency that could not be found. */
export function shipped(
  lock: Lockfile,
  roots: readonly string[],
): { packages: Shipped[]; missing: string[] } {
  const packages: Shipped[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();
  const queue = roots.map((location) => ({ location, via: [] as string[] }));
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const { location, via } = next;
    if (seen.has(location)) continue;
    seen.add(location);
    const entry = lock.packages[location];
    if (entry === undefined) {
      missing.push(`${location} (${via.join(" > ")})`);
      continue;
    }
    // A workspace package is installed as a link to its folder.
    if (entry.link === true) {
      queue.push({ location: entry.resolved!, via });
      continue;
    }
    const name =
      entry.name ?? location.slice(location.lastIndexOf("node_modules/") + "node_modules/".length);
    const workspace = !location.includes("node_modules/");
    if (!workspace) packages.push({ name, version: entry.version!, via });
    for (const [dependency, optional] of needs(entry)) {
      const found = locate(lock, location, dependency);
      if (found !== undefined) queue.push({ location: found, via: [...via, name] });
      else if (!optional) missing.push(`${dependency} (${[...via, name].join(" > ")})`);
    }
  }
  return { packages, missing };
}

/** What is wrong with what the roots ship; none when the check passes. */
export function dependencyProblems(
  lock: Lockfile,
  roots: readonly string[],
  allowed: Record<string, string>,
  vendorDoc: string,
): string[] {
  const { packages, missing } = shipped(lock, roots);
  const problems = missing.map((what) => `${what}: not in package-lock.json; run \`npm install\`.`);
  for (const { name, version, via } of packages) {
    if (isUnready(version) && !(name in allowed)) {
      problems.push(
        `${name}@${version} (${via.join(" > ")}) is not a released version: depend on one, or add it to ALLOWED in scripts/checkDependencies.ts and docs/vendor-code.md.`,
      );
    }
  }
  for (const name of Object.keys(allowed)) {
    if (!packages.some((p) => p.name === name && isUnready(p.version))) {
      problems.push(
        `${name}: allowed in scripts/checkDependencies.ts, but no unready version of it is shipped; take it off.`,
      );
    }
    if (!vendorDoc.includes(`\`${name}\``)) {
      problems.push(
        `${name}: allowed in scripts/checkDependencies.ts, but docs/vendor-code.md does not name it.`,
      );
    }
  }
  return problems;
}

export type DependenciesIo = {
  lockfile(): Lockfile;
  vendorDoc(): string;
  npmrc(): string;
  log(message: string): void;
};

export function defaultIo(root: string): DependenciesIo {
  return {
    lockfile: () => JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as Lockfile,
    vendorDoc: () => readFileSync(join(root, "docs/vendor-code.md"), "utf8"),
    npmrc: () => readFileSync(join(root, ".npmrc"), "utf8"),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when the app ships only released versions, or allowed ones, installed as they should be. */
export function main(io: DependenciesIo): number {
  const lock = io.lockfile();
  const vendorDoc = io.vendorDoc();
  const problems = [
    ...dependencyProblems(lock, SHIPPED, ALLOWED, vendorDoc),
    ...installProblems(lock, io.npmrc(), INSTALL_SCRIPTS, vendorDoc),
  ];
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log(
    "The app ships released versions only, and the allowed ones (docs/vendor-code.md#maturity), installed from the registry without install scripts (docs/vendor-code.md#installing).",
  );
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkDependencies.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
