// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve as resolvePath } from "node:path";
import { parse } from "yaml";
import { checkContract } from "./contract.ts";
import {
  createAccounts,
  resolveSubdomainsOfLocalhost,
  signIn,
  trustCa,
  type Login,
  type SignedInServer,
} from "./signedIn.ts";

export type Tier = "blocking" | "advisory";

/** A Solid server the tests run against. */
export interface SolidServer {
  /** Its id in SERVERS, or "external" for SOLID_SERVER_URL. */
  id: string;
  tier: Tier;
  /** What it is, in test names: "Community Solid Server 7.2.0". */
  name: string;
  /** Its pod root, ending in a slash. */
  url: string;
}

export interface StartedServer {
  server: SolidServer;
  stop: () => Promise<void>;
}

/**
 * How a server the tests start is run, besides its servers/<id>/compose.yml:
 * the port its container listens on (published on 127.0.0.1 at the port
 * the harness picks, E2E_PORT), where its pod root and a page that answers
 * once it is up are, below http://127.0.0.1:<port>/, and its name.
 * Blocking servers gate CI; advisory ones only report (docs/testing.md).
 */
interface Entry {
  label: string;
  tier: Tier;
  internalPort: number;
  podPath: string;
  readyPath: string;
  startTimeoutMs: number;
  /** The version in its name, from what pins it. */
  version: () => string;
  /** Its image's entrypoint needs root (to install, then hand over), so it keeps its capabilities. */
  rootEntrypoint?: true;
  /** It fails writes made at once from several test files (vitest.config.ts runs one file at a time for it). */
  serialFiles?: true;
  /** It makes its URLs from each request's Host, so it is told none. */
  urlFromHost?: true;
  /**
   * It has an instance that isn't open, in servers/<id>/signed-in.yml:
   * how its accounts are made and sign in (signedIn.ts), and the host it
   * is reached at, which its server is told. A server without one says
   * why in docs/testing.md.
   */
  signedIn?: { login: Login; host: "127.0.0.1" | "localhost" };
}

/** The servers the end-to-end tests can start, by the id SOLID_SERVERS names them with. */
export const SERVERS = {
  "css-7": {
    label: "Community Solid Server",
    tier: "blocking",
    internalPort: 3000,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    version: () => imageTag("css-7"),
    signedIn: { login: "css", host: "127.0.0.1" },
  },
  "css-6": {
    label: "Community Solid Server",
    tier: "blocking",
    internalPort: 3000,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    version: () => imageTag("css-6"),
    signedIn: { login: "css-6", host: "127.0.0.1" },
  },
  "nss-6": {
    label: "node-solid-server",
    tier: "blocking",
    internalPort: 8443,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    version: () => lockedVersion("nss/6", "solid-server"),
    signedIn: { login: "nss", host: "localhost" },
  },
  "nss-5": {
    label: "node-solid-server",
    tier: "blocking",
    internalPort: 8443,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    version: () => lockedVersion("nss/5", "solid-server"),
    signedIn: { login: "nss", host: "localhost" },
  },
  "css-8": {
    label: "Community Solid Server",
    tier: "advisory",
    internalPort: 3000,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    version: () => imageTag("css-8"),
    signedIn: { login: "css", host: "127.0.0.1" },
  },
  "css-acp": {
    label: "Community Solid Server with ACP",
    // The one server with Access Control Policies that gates CI: a release's ACR is written here (docs/testing.md).
    tier: "blocking",
    internalPort: 3000,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    version: () => baseImageTag("css-acp"),
    signedIn: { login: "css", host: "127.0.0.1" },
  },
  pivot: {
    label: "Pivot",
    tier: "advisory",
    internalPort: 3000,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    // With the Community Solid Server it runs on, which its lockfile and solidcommunity.net's may resolve differently.
    version: () =>
      `${lockedVersion("pivot", "@solid/pivot")} (Community Solid Server ${lockedVersion("pivot", "@solid/community-server")})`,
    signedIn: { login: "css", host: "127.0.0.1" },
  },
  nextcloud: {
    label: "Solid-Nextcloud",
    tier: "advisory",
    internalPort: 80,
    podPath: "apps/solid/~alice/storage/",
    readyPath: "apps/solid/~alice/storage/",
    // Installing Nextcloud, on every start.
    startTimeoutMs: 180_000,
    version: () =>
      `${dockerfileArg("nextcloud", "SOLID_NEXTCLOUD_SHA").slice(0, 8)} (Nextcloud ${baseImageTag("nextcloud")})`,
    rootEntrypoint: true,
    // It fails concurrent writes to one document (docs/interop.md#nc-concurrent-patch),
    // so tests would fail by chance.
    serialFiles: true,
  },
  jss: {
    label: "JavaScript Solid Server",
    tier: "advisory",
    internalPort: 4443,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 30_000,
    version: () => lockedVersion("jss", "javascript-solid-server"),
    urlFromHost: true,
    signedIn: { login: "jss", host: "127.0.0.1" },
  },
  "css-lws": {
    label: "Community Solid Server with LWS",
    tier: "advisory",
    internalPort: 3000,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    // The fork's commit, on the release css-8 runs, so a failure only it shows comes from its LWS changes.
    version: () =>
      `${dockerfileArg("css-lws", "CSS_LWS_VERSION")} (${dockerfileArg("css-lws", "CSS_LWS_SHA").slice(0, 8)})`,
  },
  "css-lws-only": {
    label: "Community Solid Server with LWS only",
    tier: "advisory",
    internalPort: 3000,
    podPath: "",
    readyPath: "",
    startTimeoutMs: 60_000,
    // css-lws's image, run with LWS alone: what the app does where Solid's own requests are not taken (docs/lws.md).
    version: () =>
      `${dockerfileArg("css-lws", "CSS_LWS_VERSION")} (${dockerfileArg("css-lws", "CSS_LWS_SHA").slice(0, 8)})`,
  },
} satisfies Record<string, Entry>;

export type ServerId = keyof typeof SERVERS;

export const SERVER_IDS = Object.keys(SERVERS) as ServerId[];

/** The servers a comma-separated list names: every one for "all", the blocking ones when it is empty. */
export function serversNamed(list: string | undefined): ServerId[] {
  if (list === undefined || list.trim() === "")
    return SERVER_IDS.filter((id) => SERVERS[id].tier === "blocking");
  if (list.trim() === "all") return [...SERVER_IDS];
  const named = list.split(",").map((id) => id.trim());
  const unknown = named.filter((id) => !(id in SERVERS));
  if (unknown.length > 0)
    throw new Error(
      `SOLID_SERVERS names no server ${unknown.join(", ")}; it knows ${SERVER_IDS.join(", ")} (or all).`,
    );
  return named as ServerId[];
}

const HERE = import.meta.dirname;
const LOGS = join(HERE, "logs");
/** Which checkout the containers belong to, so two worktrees' runs keep apart. */
const CHECKOUT = createHash("sha1").update(join(HERE, "../..")).digest("hex").slice(0, 6);
/** Values for what compose files ask (E2E_PORT, E2E_SECRET) when only pulling or building. */
const PLACEHOLDERS = { E2E_PORT: "1", E2E_SECRET: "placeholder" };

export const composeFile = (id: string) => join(HERE, "servers", id, "compose.yml");
export const signedInFile = (id: string) => join(HERE, "servers", id, "signed-in.yml");
const TLS_FILE = join(HERE, "servers", "compose.tls.yml");

/** One of a server's instances: the open one, or the signed-in one (servers/<id>/signed-in.yml). */
interface Instance {
  /** What its log and lock files are named after, and its compose project. */
  key: string;
  file: string;
}
const openInstance = (id: ServerId): Instance => ({ key: id, file: composeFile(id) });
const signedInInstance = (id: ServerId): Instance => ({
  key: `${id}-signed-in`,
  file: signedInFile(id),
});
const project = (key: string) => `solid-memo-e2e-${key}-${CHECKOUT}`;
const compose = ({ key, file }: Instance, args: string[], env: Record<string, string>) =>
  docker(["compose", "-p", project(key), "-f", file, ...args], env);

/** The tag its image is pinned to in its compose.yml: "7.2.0". */
function imageTag(id: string): string {
  const tag = /^\s*image:\s*[^\s:]+:([^@\s]+)@sha256:/m.exec(
    readFileSync(composeFile(id), "utf8"),
  )?.[1];
  if (tag === undefined) throw new Error(`${composeFile(id)} pins no image by tag and digest.`);
  return tag;
}

/** A build argument's value in a server's Dockerfile: the commit an image is built from. */
function dockerfileArg(id: string, name: string): string {
  const value = new RegExp(`^ARG ${name}=(\\S+)`, "m").exec(
    readFileSync(join(HERE, "servers", id, "Dockerfile"), "utf8"),
  )?.[1];
  if (value === undefined) throw new Error(`servers/${id}/Dockerfile sets no ${name}.`);
  return value;
}

/** The tag of the image a server's Dockerfile builds on: "32.0.15-apache" says "32.0.15". */
function baseImageTag(id: string): string {
  const tag = /^FROM [^\s:]+:(\d[\w.]*?)(-[\w]+)?@sha256:/m.exec(
    readFileSync(join(HERE, "servers", id, "Dockerfile"), "utf8"),
  )?.[1];
  if (tag === undefined)
    throw new Error(`servers/${id}/Dockerfile builds on no image pinned by tag and digest.`);
  return tag;
}

/** A package's version in the lockfile an image is built from (servers/<dir>/package-lock.json). */
function lockedVersion(dir: string, pkg: string): string {
  const lock = JSON.parse(
    readFileSync(join(HERE, "servers", dir, "package-lock.json"), "utf8"),
  ) as { packages: Record<string, { version: string }> };
  return lock.packages[`node_modules/${pkg}`]!.version;
}

/**
 * The patterns of a build context's .dockerignore, as the ones used here
 * are written: a name excluded at the top ("node_modules") or, after
 * "**" and a slash, at any depth. Anything else is refused rather than
 * misread.
 */
function ignoredIn(context: string): { name: string; anyDepth: boolean }[] {
  const file = join(context, ".dockerignore");
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  return lines.map((line) => {
    const anyDepth = line.startsWith("**/");
    const name = anyDepth ? line.slice(3) : line;
    if (!/^[\w.-]+$/.test(name))
      throw new Error(
        `${file}: "${line}" is a pattern the image cache's hash (servers.ts) does not know.`,
      );
    return { name, anyDepth };
  });
}

/** The files of a build context Docker sends, relative to it, sorted. */
function contextFiles(context: string): string[] {
  const ignored = ignoredIn(context);
  const files: string[] = [];
  const walk = (dir: string, depth: number): void => {
    for (const entry of readdirSync(join(context, dir), { withFileTypes: true })) {
      if (ignored.some(({ name, anyDepth }) => entry.name === name && (anyDepth || depth === 0)))
        continue;
      const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) files.push(path);
    }
  };
  walk("", 0);
  return files.sort();
}

/**
 * A hash of what an image is built from: the compose file (its build
 * arguments with it), and every file of the build context Docker is sent,
 * with whether it is executable, which COPY keeps.
 */
export function inputsOf(composePath: string): string | null {
  const text = readFileSync(composePath, "utf8");
  const build = (parse(text) as { services: { server: { build?: string | { context: string } } } })
    .services.server.build;
  if (build === undefined) return null;
  const context = resolvePath(
    dirname(composePath),
    typeof build === "string" ? build : build.context,
  );
  const hash = createHash("sha256").update(text);
  for (const file of contextFiles(context)) {
    const executable = (statSync(join(context, file)).mode & 0o111) !== 0;
    hash.update(`\0${file}\0${executable ? "x" : "-"}\0`).update(readFileSync(join(context, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

/**
 * A server built here: the image its compose file names, and the tag
 * that image is also given, from the hash of what it is built from
 * (inputsOf). null for a server whose image is pulled.
 */
export function builtImage(id: string): { image: string; inputs: string } | null {
  const inputs = inputsOf(composeFile(id));
  if (inputs === null) return null;
  const image = (
    parse(readFileSync(composeFile(id), "utf8")) as { services: { server: { image: string } } }
  ).services.server.image;
  return { image, inputs: `${repositoryOf(image)}:inputs-${inputs}` };
}

/** An image reference without its tag: "localhost/solid-memo-e2e-nss-6". */
const repositoryOf = (image: string) => image.replace(/:[^:/]+$/, "");

/**
 * What names the images a server runs, for CI's image cache
 * (.github/actions/e2e-images): its built image's inputs tag, or its
 * compose file, which pins a pulled image by digest.
 */
export function imageKey(id: ServerId): string {
  const naming = builtImage(id)?.inputs ?? readFileSync(composeFile(id), "utf8");
  // The signed-in instance's TLS image is saved with the server's (images.ts).
  const tls = existsSync(signedInFile(id)) ? readFileSync(TLS_FILE, "utf8") : "";
  return createHash("sha256").update(naming).update(tls).digest("hex").slice(0, 16);
}

/** Whether Docker has an image by that reference. */
async function hasImage(reference: string): Promise<boolean> {
  return docker(["image", "inspect", reference], {}).then(
    () => true,
    () => false,
  );
}

/**
 * Pulls the server's image unless it is here, or builds it, unless an
 * image built from the same files is here (its inputs tag, which CI's
 * image cache brings along, so a job never needs the base image again).
 */
export async function prepare(id: ServerId): Promise<void> {
  // The signed-in instance runs the server's image, behind TLS.
  if (existsSync(signedInFile(id)))
    await compose(
      signedInInstance(id),
      ["pull", "--ignore-buildable", "--policy", "missing", "--quiet"],
      PLACEHOLDERS,
    );
  const built = builtImage(id);
  if (built !== null && (await hasImage(built.inputs))) {
    await docker(["tag", built.inputs, built.image], {});
    return;
  }
  const open = openInstance(id);
  await compose(
    open,
    ["pull", "--ignore-buildable", "--policy", "missing", "--quiet"],
    PLACEHOLDERS,
  );
  await compose(open, ["build", "--quiet"], PLACEHOLDERS);
  // Tagged only when nothing changed while it was built, and older tags let go, so `docker image prune` takes their images.
  if (built === null || builtImage(id)?.inputs !== built.inputs) return;
  await docker(["tag", built.image, built.inputs], {});
  const tags = await docker(
    [
      "image",
      "ls",
      "--filter",
      `reference=${repositoryOf(built.image)}:inputs-*`,
      "--format",
      "{{.Repository}}:{{.Tag}}",
    ],
    {},
  );
  const older = tags.split("\n").filter((tag) => tag !== "" && tag !== built.inputs);
  if (older.length > 0) await docker(["rmi", ...older], {});
}

/** An instance's containers, up on a free port of 127.0.0.1, what they print going to logs/<key>.log. */
interface Running {
  port: string;
  log: string;
  stop: () => Promise<void>;
  /** Runs a command in one of its services, giving what it printed. */
  exec: (service: string, command: string[]) => Promise<string>;
}

async function bringUp(instance: Instance): Promise<Running> {
  const { key, file } = instance;
  await clearLeftovers(key);
  const env = { E2E_PORT: "", E2E_SECRET: randomUUID() };
  const log = join(LOGS, `${key}.log`);
  let logs: ChildProcess | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      running.delete(stopNow);
      await compose(instance, ["down", "-v", "--remove-orphans", "-t", "0"], env);
      logs?.kill();
      await rm(lockFile(key), { force: true });
    })());
  const stopNow = () => {
    if (stopping !== undefined) return;
    stopping = Promise.resolve();
    running.delete(stopNow);
    const args = ["compose", "-p", project(key), "-f", file, "down", "-v", "--remove-orphans"];
    spawnSync("docker", [...args, "-t", "0"], {
      env: { ...process.env, ...env },
      stdio: "ignore",
    });
    logs?.kill();
    rmSync(lockFile(key), { force: true });
  };
  running.add(stopNow);
  // The port is free when picked, not necessarily when Docker binds it: one more try.
  for (let attempt = 1; ; attempt++) {
    env.E2E_PORT = String(await freePort());
    try {
      await compose(instance, ["up", "-d", "--no-build", "--pull", "never"], env);
      break;
    } catch (error) {
      await compose(instance, ["down", "-v", "--remove-orphans", "-t", "0"], env);
      if (attempt === 2 || !/already allocated|address already in use/.test(String(error))) {
        running.delete(stopNow);
        throw error;
      }
    }
  }
  await mkdir(LOGS, { recursive: true });
  await writeFile(lockFile(key), JSON.stringify({ pid: process.pid }));
  logs = follow(instance, env, log);
  return {
    port: env.E2E_PORT,
    log,
    stop,
    exec: (service, command) => compose(instance, ["exec", "-T", service, ...command], env),
  };
}

/**
 * The server, up on a free port of 127.0.0.1 and meeting the contract
 * (contract.ts), what it prints going to logs/<id>.log; it is stopped
 * (its containers and their data removed) if it does not get that far.
 */
export async function startServer(id: ServerId): Promise<StartedServer> {
  const entry: Entry = SERVERS[id];
  // Before the images change: what a killed run left holds on to them.
  await clearLeftovers(openInstance(id).key);
  await clearLeftovers(signedInInstance(id).key);
  await prepare(id);
  const { port, log, stop } = await bringUp(openInstance(id));
  const base = `http://127.0.0.1:${port}/`;
  const server: SolidServer = {
    id,
    tier: entry.tier,
    name: `${entry.label} ${entry.version()}`,
    url: base + entry.podPath,
  };
  try {
    await untilUp(server.name, base + entry.readyPath, entry.startTimeoutMs, log);
    await checkContract(server.url);
  } catch (error) {
    await stop();
    throw new Error(`${server.name} (${id}): ${(error as Error).message}\nIts log: ${log}`, {
      cause: error,
    });
  }
  return { server, stop };
}

/** Caddy's CA, which it makes as it starts (servers/compose.tls.yml). */
async function caddyCa({ exec }: Running): Promise<string> {
  const path = "/data/caddy/pki/authorities/local/root.crt";
  for (let attempt = 1; ; attempt++) {
    try {
      return await exec("tls", ["cat", path]);
    } catch (error) {
      if (attempt === 60) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

/**
 * The server's instance that isn't open, up behind TLS, with its two
 * accounts, each signed in once to show they can: null for a server with
 * none. It is stopped if it does not get that far. The image is the one
 * startServer prepares, so that runs first.
 */
export async function startSignedIn(
  id: ServerId,
): Promise<{ server: SignedInServer; stop: () => Promise<void> } | null> {
  const entry: Entry = SERVERS[id];
  if (entry.signedIn === undefined) return null;
  const running = await bringUp(signedInInstance(id));
  const { port, log, stop } = running;
  const url = `https://${entry.signedIn.host}:${port}/`;
  const name = `${entry.label} ${entry.version()}`;
  try {
    const ca = await caddyCa(running);
    trustCa(ca);
    resolveSubdomainsOfLocalhost();
    await untilUp(name, `${url}.well-known/openid-configuration`, entry.startTimeoutMs, log);
    const { login } = entry.signedIn;
    const { owner, stranger } = await createAccounts(login, url);
    const server: SignedInServer = { id, tier: entry.tier, name, url, ca, login, owner, stranger };
    await signIn(server, owner);
    await signIn(server, stranger);
    return { server, stop };
  } catch (error) {
    await stop();
    throw new Error(`${name} (${id}, signed in): ${(error as Error).message}\nIts log: ${log}`, {
      cause: error,
    });
  }
}

/** How to take down, at once, each server this process has brought up and not stopped. */
const running = new Set<() => void>();

/**
 * Takes this process's servers down when it ends without its teardown:
 * on Ctrl-C (Vitest exits a millisecond after it, and without a terminal
 * nothing handles it), a kill, or an exit. Set up before starting any.
 */
export function stopOnExit(): void {
  const stopAllNow = () => running.forEach((stopNow) => stopNow());
  process.once("exit", stopAllNow);
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    process.once(signal, () => {
      stopAllNow();
      process.exit(code);
    });
  }
}

/**
 * Takes down what an earlier run of this checkout left of the server (a
 * run killed before its teardown), unless that run is still going: its
 * lock names a live process and its project is still there.
 */
async function clearLeftovers(key: string): Promise<void> {
  if (existsSync(lockFile(key))) {
    const { pid } = JSON.parse(await readFile(lockFile(key), "utf8")) as { pid: number };
    if (pid !== process.pid && alive(pid) && (await projects()).includes(project(key))) {
      throw new Error(
        `Another run (process ${pid}) is using ${key}; if there is none, run npm run pod:clean.`,
      );
    }
  }
  await takeDown(project(key));
}

/** Every server this checkout's runs left behind, taken down: `npm run pod:clean`. */
export async function clean(): Promise<string[]> {
  const ours = (await projects()).filter(
    (name) => name.startsWith("solid-memo-e2e-") && name.endsWith(`-${CHECKOUT}`),
  );
  await Promise.all(ours.map(takeDown));
  await rm(LOGS, { recursive: true, force: true });
  return ours;
}

/** A compose project, down by its name alone: compose needs no file for that, nor its variables. */
const takeDown = (name: string) =>
  docker(["compose", "-p", name, "down", "-v", "--remove-orphans", "-t", "0"], {}, tmpdir());

async function projects(): Promise<string[]> {
  const listed = JSON.parse(await docker(["compose", "ls", "--all", "--format", "json"], {})) as {
    Name: string;
  }[];
  return listed.map(({ Name }) => Name);
}

const lockFile = (key: string) => join(LOGS, `${key}.lock`);

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** What the server prints, with times, into the file, until killed or the server is gone. */
function follow(
  { key, file: composePath }: Instance,
  env: Record<string, string>,
  file: string,
): ChildProcess {
  const child = spawn(
    "docker",
    ["compose", "-p", project(key), "-f", composePath, "logs", "-f", "--no-color", "--timestamps"],
    {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const out = createWriteStream(file);
  child.stdout!.pipe(out);
  child.stderr!.pipe(out);
  return child;
}

/** Runs docker, resolving with what it printed; rejecting with it if it fails. */
function docker(args: string[], env: Record<string, string>, cwd = HERE): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => void (out += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => void (out += chunk.toString()));
    child.on("error", (error) =>
      reject(
        new Error(
          `docker could not be run (${error.message}); the end-to-end tests start their servers in it (docs/testing.md).`,
        ),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`docker ${args.join(" ")} failed (${code}):\n${out}`)),
    );
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
    probe.on("error", reject);
  });
}

async function untilUp(name: string, url: string, timeoutMs: number, log: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const up = await fetch(url).then(
      (r) => r.ok,
      () => false,
    );
    if (up) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const printed = await readFile(log, "utf8").catch(() => "");
  throw new Error(
    `${name} did not answer at ${url} within ${timeoutMs / 1000}s; it printed last:\n${printed.split("\n").slice(-20).join("\n")}`,
  );
}

/**
 * `node servers.ts prepare [id...]` pulls or builds the servers' images
 * (every one when none is named), `contract [id...]` starts each, checks
 * the contract, signs in on its signed-in instance and stops them, `key <id>` prints what names its images
 * (imageKey), `keys [id...]` each server's id and key, one a line (the
 * blocking servers when none is named), `clean` takes down what
 * interrupted runs left.
 */
if (import.meta.main) {
  const [command, ...ids] = process.argv.slice(2);
  const named = serversNamed(ids.length > 0 ? ids.join(",") : command === "keys" ? "" : "all");
  if (command === "prepare") {
    for (const id of named) {
      console.log(`Preparing ${id}`);
      await prepare(id);
    }
  } else if (command === "contract") {
    stopOnExit();
    for (const id of named) {
      const { server, stop } = await startServer(id);
      await stop();
      console.log(`${server.name} (${id}) meets the contract.`);
      const signedIn = await startSignedIn(id);
      await signedIn?.stop();
      if (signedIn !== null) console.log(`${server.name} (${id}) signs its accounts in.`);
    }
  } else if (command === "key" && named.length === 1) {
    console.log(imageKey(named[0]!));
  } else if (command === "keys") {
    for (const id of named) console.log(`${id} ${imageKey(id)}`);
  } else if (command === "clean") {
    const taken = await clean();
    console.log(taken.length > 0 ? `Took down ${taken.join(", ")}.` : "Nothing to take down.");
  } else {
    throw new Error(`Usage: node servers.ts prepare|contract|keys|clean [id...] | key <id>`);
  }
}
