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
 * lockfile that is fetched is the npm registry's tarball of its own name
 * and version with its integrity hash, at a location and with a version
 * that can mean nothing else, links lead only to the workspace, and none
 * but the ones in INSTALL_SCRIPTS asks to run a script when installed;
 * each of those must be named in docs/vendor-code.md and still ask.
 *
 * The other lockfiles npm installs from (LOCKFILE_DIRS: the Renovate the
 * Pending updates workflow runs, and each end-to-end test server) are held
 * to the same rules of where a package comes from and what it may claim.
 * The maturity rule and the install-script rules stay with the root: those
 * packages are not shipped, and each is installed with `--ignore-scripts`
 * on npm's command line.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** What package-lock.json says of one installed package (lockfileVersion 3). */
export type LockEntry = {
  name?: string;
  version?: string;
  link?: boolean;
  resolved?: string;
  integrity?: string;
  hasInstallScript?: boolean;
  hasShrinkwrap?: boolean;
  inBundle?: boolean;
  bundleDependencies?: string[];
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

/**
 * Each directory npm installs a package-lock.json from: the workspace's root,
 * each end-to-end test server, and the Renovate the Pending updates workflow
 * runs. A test checks that no other package-lock.json is in the repository.
 */
export const LOCKFILE_DIRS = [
  ".",
  "e2e/pod/servers/jss",
  "e2e/pod/servers/nss/5",
  "e2e/pod/servers/nss/6",
  "e2e/pod/servers/pivot",
  "scripts/renovate",
];

/** Where every package in the lockfile comes from. */
const REGISTRY = "https://registry.npmjs.org/";

/**
 * One part of a path, as npm and the registry both read it: no separator, no
 * `#`, `?` or `%`, and no leading dot, so never `.` or `..`.
 */
const PATH_PART = "[\\w~-][\\w.~-]*";
const FOLDER = new RegExp(`^${PATH_PART}$`);
const PACKAGE_NAME = new RegExp(`^(?:@${PATH_PART}/)?${PATH_PART}$`);
const IDENTIFIERS = "[\\dA-Za-z-]+(?:\\.[\\dA-Za-z-]+)*";
const INTEGRITY = /^sha(?:1|256|384|512)-[\d+/A-Za-z]+={0,2}$/;
const VERSION = new RegExp(`^\\d+\\.\\d+\\.\\d+(?:-${IDENTIFIERS})?(?:\\+${IDENTIFIERS})?$`);

/** Whether a lockfile location names a folder of the workspace, the root (`""`) among them. */
function isWorkspaceFolder(location: string): boolean {
  return (
    location === "" ||
    location.split("/").every((part) => FOLDER.test(part) && part !== "node_modules")
  );
}

/**
 * The name a location installs a package under, or undefined unless the location is exactly
 * `(<workspace folder>/)node_modules/<name>(/node_modules/<name>...)`. npm treats a location as
 * a path and an address as a URL, so anything else could mean one package to the one and another
 * to the other.
 */
function installedName(location: string): string | undefined {
  const [workspace, ...names] = `/${location}`.split("/node_modules/");
  const exact =
    names.length > 0 &&
    isWorkspaceFolder(workspace!.slice(1)) &&
    names.every((name) => PACKAGE_NAME.test(name));
  return exact ? names.at(-1) : undefined;
}

/** A workspace package's package.json, read from its folder. */
export type Manifest = Pick<
  LockEntry,
  "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies"
>;

/** What one entry of the lockfile is checked against. */
type InstallContext = {
  lock: Lockfile;
  manifest: (location: string) => Manifest | undefined;
  aliases: Set<string>;
  /** The allowed install scripts, or undefined for a lockfile installed with `--ignore-scripts`. */
  installScripts: Record<string, string> | undefined;
  withScripts: Set<string>;
};

/**
 * The aliases the workspace's package.json files declare, each as `<installed name> <real name>`.
 * The files are read, and the lockfile is not asked: `npm ci` accepts an entry's `name`, and a
 * workspace entry's dependencies, that the package.json files do not back.
 */
function workspaceAliases(
  lock: Lockfile,
  manifest: (location: string) => Manifest | undefined,
): Set<string> {
  const aliases = new Set<string>();
  for (const location of Object.keys(lock.packages).filter(isWorkspaceFolder)) {
    const { dependencies, devDependencies, optionalDependencies, peerDependencies } =
      manifest(location) ?? {};
    const declared = [
      dependencies,
      devDependencies,
      optionalDependencies,
      peerDependencies,
    ].flatMap((listed) => Object.entries(listed ?? {}));
    for (const [installed, range] of declared) {
      const real = /^npm:(@?[^@]+)/.exec(range)?.[1];
      if (real !== undefined) aliases.add(`${installed} ${real}`);
    }
  }
  return aliases;
}

/** A folder of the workspace: it has a package.json in the repository, and nothing to fetch. */
function workspaceProblems(
  location: string,
  entry: LockEntry,
  { manifest }: InstallContext,
): string[] {
  const problems: string[] = [];
  if (manifest(location) === undefined) {
    problems.push(`${location}: listed as part of the workspace, but has no package.json.`);
  }
  if (entry.resolved !== undefined || entry.integrity !== undefined) {
    problems.push(`${location}: part of the workspace, but has an address or integrity hash.`);
  }
  return problems;
}

/** A link is installed as a symlink, which may only lead to a folder of the workspace. */
function linkProblems(location: string, entry: LockEntry, { lock }: InstallContext): string[] {
  const target = entry.resolved ?? "";
  const toWorkspace =
    target !== "" && isWorkspaceFolder(target) && Object.hasOwn(lock.packages, target);
  return toWorkspace ? [] : [`${location}: a link to ${target}, not to a workspace folder.`];
}

/** A package `npm ci` fetches: only the registry's tarball of its own name and version will do. */
function fetchedProblems(
  location: string,
  entry: LockEntry,
  installed: string,
  { aliases, installScripts, withScripts }: InstallContext,
): string[] {
  const name = entry.name ?? installed;
  if (!PACKAGE_NAME.test(name) || !VERSION.test(entry.version ?? "")) {
    return [
      `${location}: name ${name} or version ${entry.version} is not one a registry address can be made of.`,
    ];
  }
  const problems: string[] = [];
  if (name !== installed && !aliases.has(`${installed} ${name}`)) {
    problems.push(
      `${location}: named ${name}, but no package.json of the workspace declares that alias; declare it in one if it is meant.`,
    );
  }
  const file = `${name.slice(name.lastIndexOf("/") + 1)}-${entry.version}.tgz`;
  const expected = `${REGISTRY}${name}/-/${file}`;
  if (entry.resolved !== expected) {
    problems.push(`${location}: resolved from ${entry.resolved}, not from ${expected}.`);
  }
  if (!INTEGRITY.test(entry.integrity ?? "")) {
    problems.push(`${location}: no integrity hash.`);
  }
  if (entry.hasInstallScript === true) withScripts.add(name);
  if (
    entry.hasInstallScript === true &&
    installScripts !== undefined &&
    !(name in installScripts)
  ) {
    problems.push(
      `${location}: has an install script, which does not run: depend on another package, or add it to INSTALL_SCRIPTS in scripts/checkDependencies.ts.`,
    );
  }
  return problems;
}

/** The dependencies an entry lists that are not version ranges, unless a package.json of the workspace declares the alias. */
function rangeProblems(location: string, entry: LockEntry, aliases: Set<string>): string[] {
  const listed = [
    entry.dependencies,
    entry.devDependencies,
    entry.optionalDependencies,
    entry.peerDependencies,
  ].flatMap((list) => Object.entries(list ?? {}));
  return listed
    .filter(([name, range]) => {
      const alias = /^npm:(@?[^@]+)(?:@[^:/]*)?$/.exec(range);
      return /[:/]/.test(range) && !(alias && aliases.has(`${name} ${alias[1]}`));
    })
    .map(([name, range]) => `${location}: asks for ${name} as ${range}, not as a version range.`);
}

/** Whether a location is below a package that is fetched and lists what it bundles. */
function hasBundler(location: string, lock: Lockfile): boolean {
  const owner = location.slice(0, Math.max(location.lastIndexOf("/node_modules/"), 0));
  const entry = lock.packages[owner];
  if (entry === undefined || entry.link === true || isWorkspaceFolder(owner)) return false;
  return entry.inBundle === true
    ? hasBundler(owner, lock)
    : Array.isArray(entry.bundleDependencies);
}

/**
 * Whether an entry comes inside another package's tarball. `inBundle` is
 * only the lockfile's word: npm fetches an address it finds beside the
 * flag, and with no address it fetches the name and version, so those
 * must be plain and the package above must bundle at all.
 */
function isBundled(location: string, entry: LockEntry, installed: string, lock: Lockfile): boolean {
  return (
    entry.inBundle === true &&
    entry.resolved === undefined &&
    entry.integrity === undefined &&
    entry.hasInstallScript !== true &&
    (entry.name ?? installed) === installed &&
    VERSION.test(entry.version ?? "") &&
    hasBundler(location, lock)
  );
}

/** What is wrong with one entry of the lockfile. */
function entryProblems(location: string, entry: LockEntry, context: InstallContext): string[] {
  if (isWorkspaceFolder(location)) return workspaceProblems(location, entry, context);
  const installed = installedName(location);
  if (installed === undefined) {
    return [`${location}: not a location where npm installs a package of a valid name.`];
  }
  // npm keeps its own fields under a leading underscore, an address among them; a lockfile has none.
  const own = Object.keys(entry).filter((field) => field.startsWith("_"));
  if (own.length > 0) return [`${location}: has ${own.join(", ")}, which a lockfile never has.`];
  if (entry.hasShrinkwrap === true) {
    return [
      `${location}: brings a shrinkwrap of its own, which decides what is installed below it.`,
    ];
  }
  if (entry.link === true) return linkProblems(location, entry, context);
  if (isBundled(location, entry, installed, context.lock)) return [];
  return fetchedProblems(location, entry, installed, context);
}

/** What is wrong with the lockfile's entries, each one where it is fetched from and what it claims. */
function entriesProblems(
  lock: Lockfile,
  manifest: (location: string) => Manifest | undefined,
  installScripts: Record<string, string> | undefined,
  withScripts: Set<string>,
): string[] {
  const aliases = workspaceAliases(lock, manifest);
  const context = { lock, manifest, aliases, installScripts, withScripts };
  const problems: string[] = [];
  for (const [location, entry] of Object.entries(lock.packages)) {
    problems.push(
      ...rangeProblems(location, entry, aliases),
      ...entryProblems(location, entry, context),
    );
  }
  return problems;
}

/**
 * What is wrong with how another lockfile's packages are installed (LOCKFILE_DIRS), each problem
 * under the lockfile's path; none when the check passes. Its packages are installed with
 * `--ignore-scripts` on npm's command line, so an install script is no problem here.
 */
export function lockfileProblems(
  lock: Lockfile,
  dir: string,
  manifest: (location: string) => Manifest | undefined,
): string[] {
  const problems =
    Object.keys(lock.packages).length === 0
      ? ["lists no packages."]
      : entriesProblems(lock, manifest, undefined, new Set());
  return problems.map((problem) => `${join(dir, "package-lock.json")}: ${problem}`);
}

/** What is wrong with how the root lockfile's packages are installed; none when the check passes. */
export function installProblems(
  lock: Lockfile,
  npmrc: string,
  installScripts: Record<string, string>,
  vendorDoc: string,
  manifest: (location: string) => Manifest | undefined,
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
  if (Object.keys(lock.packages).length === 0) {
    problems.push("package-lock.json: lists no packages.");
  }
  problems.push(...entriesProblems(lock, manifest, installScripts, withScripts));
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

/** How the check reads the repository; `dir` is one of LOCKFILE_DIRS. */
export type DependenciesIo = {
  lockfile(dir: string): Lockfile;
  vendorDoc(): string;
  npmrc(): string;
  manifest(dir: string, location: string): Manifest | undefined;
  hasShrinkwrap(dir: string): boolean;
  log(message: string): void;
};

export function defaultIo(root: string): DependenciesIo {
  return {
    lockfile: (dir) =>
      JSON.parse(readFileSync(join(root, dir, "package-lock.json"), "utf8")) as Lockfile,
    vendorDoc: () => readFileSync(join(root, "docs/vendor-code.md"), "utf8"),
    npmrc: () => readFileSync(join(root, ".npmrc"), "utf8"),
    manifest: (dir, location) => {
      const path = join(root, dir, location, "package.json");
      return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Manifest) : undefined;
    },
    hasShrinkwrap: (dir) => existsSync(join(root, dir, "npm-shrinkwrap.json")),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when the app ships only released versions, or allowed ones, installed as they should be. */
export function main(io: DependenciesIo): number {
  const lock = io.lockfile(".");
  const vendorDoc = io.vendorDoc();
  const manifestIn = (dir: string) => (location: string) => io.manifest(dir, location);
  const problems = [
    ...dependencyProblems(lock, SHIPPED, ALLOWED, vendorDoc),
    ...installProblems(lock, io.npmrc(), INSTALL_SCRIPTS, vendorDoc, manifestIn(".")),
    ...LOCKFILE_DIRS.filter((dir) => dir !== ".").flatMap((dir) =>
      lockfileProblems(io.lockfile(dir), dir, manifestIn(dir)),
    ),
    ...LOCKFILE_DIRS.filter((dir) => io.hasShrinkwrap(dir)).map(
      (dir) =>
        `${join(dir, "npm-shrinkwrap.json")}: \`npm ci\` prefers it to package-lock.json, the file checked here.`,
    ),
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
