/**
 * `npm run check:dependencies`: the app ships only released versions of
 * other code (docs/vendor-code.md#maturity). It walks package-lock.json
 * from the app the site serves (apps/web, which loads apps/studio) over
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
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** What package-lock.json says of one installed package (lockfileVersion 3). */
export type LockEntry = {
  name?: string;
  version?: string;
  link?: boolean;
  resolved?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

export type Lockfile = { packages: Record<string, LockEntry> };

/** The workspace packages whose run-time dependencies are shipped. */
export const SHIPPED = ["apps/web"];

/** The unready versions the app may ship, and why (docs/vendor-code.md#maturity). */
export const ALLOWED: Record<string, string> = {
  "rdf-validate-shacl": "The only SHACL engine for RDF/JS; maintained by Zazuko, behind the ShapeEngine interface.",
  "rdf-validate-datatype": "rdf-validate-shacl's check of literals, by the same maintainers.",
  "@inrupt/solid-client-errors": "Part of @inrupt/solid-client 4, released with it by Inrupt.",
  process: "The browser's stand-in for Node's process, which readable-stream asks for.",
};

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
export function shipped(lock: Lockfile, roots: readonly string[]): { packages: Shipped[]; missing: string[] } {
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
    const name = entry.name ?? location.slice(location.lastIndexOf("node_modules/") + "node_modules/".length);
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
      problems.push(`${name}: allowed in scripts/checkDependencies.ts, but no unready version of it is shipped; take it off.`);
    }
    if (!vendorDoc.includes(`\`${name}\``)) {
      problems.push(`${name}: allowed in scripts/checkDependencies.ts, but docs/vendor-code.md does not name it.`);
    }
  }
  return problems;
}

export type DependenciesIo = { lockfile(): Lockfile; vendorDoc(): string; log(message: string): void };

export function defaultIo(root: string): DependenciesIo {
  return {
    lockfile: () => JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as Lockfile,
    vendorDoc: () => readFileSync(join(root, "docs/vendor-code.md"), "utf8"),
    log: (message) => console.log(message),
  };
}

/** Exit code: 0 when the app ships only released versions, or allowed ones. */
export function main(io: DependenciesIo): number {
  const problems = dependencyProblems(io.lockfile(), SHIPPED, ALLOWED, io.vendorDoc());
  for (const problem of problems) io.log(problem);
  if (problems.length > 0) return 1;
  io.log("The app ships released versions only, and the allowed ones (docs/vendor-code.md#maturity).");
  return 0;
}

/** The script entry: `node -e "import('./scripts/checkDependencies.ts').then((m) => m.run(process))"`. */
export function run(process: { exitCode?: number | string | null | undefined }): void {
  process.exitCode = main(defaultIo(resolve(import.meta.dirname, "..")));
}
