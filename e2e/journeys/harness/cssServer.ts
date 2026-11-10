// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "@playwright/test";
import { journeyServer } from "./journeyServer.ts";

/**
 * The Solid server the journeys log in to and keep their pods on, behind
 * TLS at https://127.0.0.1:<port>/, one per run: the Community Solid
 * Server 7 of css/compose.yml, or the one JOURNEY_SERVER names
 * (journeyServer.ts). Patterned on e2e/pod/servers.ts, which runs its
 * servers over http.
 */

const HERE = join(import.meta.dirname, "..");
export const SERVER = journeyServer(process.env.JOURNEY_SERVER, HERE);
const COMPOSE_FILE = SERVER.compose;
export const LOGS = join(HERE, "logs");
export const CSS_LOG = join(LOGS, "css.log");
/** Which checkout the containers belong to, so two worktrees' runs keep apart. */
const CHECKOUT = createHash("sha1").update(join(HERE, "../..")).digest("hex").slice(0, 6);
const PREFIX = `solid-memo-journeys-${CHECKOUT}-`;
/** What the compose file asks (E2E_PORT) when only pulling. */
const PLACEHOLDERS = { E2E_PORT: "1" };
const START_TIMEOUT_MS = 90_000;

export interface StartedCss {
  /** Its root, which is also its OIDC issuer: https://127.0.0.1:<port>/. */
  url: string;
  stop: () => Promise<void>;
}

/**
 * Pulls the images unless they are here; a Linked Web Storage server's,
 * which no registry has, e2e/pod builds (or tags, from its cache).
 */
export async function prepare(): Promise<void> {
  if (SERVER.lws) {
    await run(process.execPath, [join(HERE, "..", "pod", "servers.ts"), "prepare", SERVER.id], {});
    return;
  }
  await docker(
    [
      "compose",
      "-p",
      `${PREFIX}prepare`,
      "-f",
      COMPOSE_FILE,
      "pull",
      "--policy",
      "missing",
      "--quiet",
    ],
    PLACEHOLDERS,
  );
}

/**
 * The server, up on a free port and answering OIDC discovery, what it
 * prints going to logs/css.log; taken down if it does not get that far,
 * and when this process ends without stopping it.
 */
export async function startCss(): Promise<StartedCss> {
  await prepare();
  // One project per process: journeys run alongside each other's servers.
  const project = `${PREFIX}${process.pid}`;
  const env = { E2E_PORT: "" };
  const compose = (args: string[]) =>
    docker(["compose", "-p", project, "-f", COMPOSE_FILE, ...args], env);
  let logs: ChildProcess | undefined;
  const stopNow = () => {
    process.off("exit", stopNow);
    spawnSync("docker", ["compose", "-p", project, "down", "-v", "--remove-orphans", "-t", "0"], {
      cwd: tmpdir(),
      stdio: "ignore",
    });
    logs?.kill();
  };
  // On any exit: Playwright's own Ctrl-C handling runs the teardown first, its reports written.
  process.once("exit", stopNow);
  const stop = async () => {
    process.off("exit", stopNow);
    await compose(["down", "-v", "--remove-orphans", "-t", "0"]);
    logs?.kill();
  };
  // The port is free when picked, not necessarily when Docker binds it: one more try.
  for (let attempt = 1; ; attempt++) {
    env.E2E_PORT = String(await freePort());
    try {
      await compose(["up", "-d", "--no-build", "--pull", "never"]);
      break;
    } catch (error) {
      await compose(["down", "-v", "--remove-orphans", "-t", "0"]).catch(() => {});
      if (attempt === 2 || !/already allocated|address already in use/.test(String(error)))
        throw error;
    }
  }
  await mkdir(LOGS, { recursive: true });
  logs = follow(project, env);
  const url = `https://127.0.0.1:${env.E2E_PORT}/`;
  try {
    await untilUp(`${url}.well-known/openid-configuration`);
    // Its first token exchanges, side by side, may each make a signing
    // key, and all but one token are then refused: reading its keys
    // first makes the one (docs/lws.md#how-its-tested).
    if (SERVER.lws) await untilUp(`${url}.well-known/lws/jwks`);
  } catch (error) {
    await stop().catch(() => {});
    throw error;
  }
  return { url, stop };
}

/** Every server this checkout's runs left behind (a killed run), taken down: `npm run css:clean`. */
export async function clean(): Promise<string[]> {
  const listed = JSON.parse(await docker(["compose", "ls", "--all", "--format", "json"], {})) as {
    Name: string;
  }[];
  const ours = listed.map(({ Name }) => Name).filter((name) => name.startsWith(PREFIX));
  await Promise.all(
    ours.map((name) =>
      docker(["compose", "-p", name, "down", "-v", "--remove-orphans", "-t", "0"], {}, tmpdir()),
    ),
  );
  return ours;
}

/** What the server and its proxy print, with times, into logs/css.log. */
function follow(project: string, env: Record<string, string>): ChildProcess {
  const child = spawn(
    "docker",
    ["compose", "-p", project, "-f", COMPOSE_FILE, "logs", "-f", "--no-color", "--timestamps"],
    {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const out = createWriteStream(CSS_LOG);
  const lost = (error: Error) =>
    console.warn(`The Solid server's log is not kept (${CSS_LOG}): ${error.message}`);
  out.on("error", lost);
  child.on("error", lost);
  child.stdout!.pipe(out);
  child.stderr!.pipe(out);
  return child;
}

/** Runs docker, resolving with what it printed; rejecting with it if it fails. */
function docker(args: string[], env: Record<string, string>, cwd = HERE): Promise<string> {
  return run("docker", args, env, cwd);
}

/** Runs `command`, resolving with what it printed; rejecting with it if it fails. */
function run(
  command: string,
  args: string[],
  env: Record<string, string>,
  cwd = HERE,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
          `${command} could not be run (${error.message}); the journeys start their Solid server in Docker (docs/testing.md).`,
        ),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${command} ${args.join(" ")} failed (${code}):\n${out}`)),
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

/** Waits for the page to answer 200, through the proxy's certificate (Node's fetch would refuse it). */
async function untilUp(url: string): Promise<void> {
  const api = await request.newContext({ ignoreHTTPSErrors: true });
  try {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const up = await api.get(url, { timeout: 5_000 }).then(
        (response) => response.ok(),
        () => false,
      );
      if (up) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } finally {
    await api.dispose();
  }
  const printed = await readFile(CSS_LOG, "utf8").catch(() => "");
  throw new Error(
    `The Solid server did not answer at ${url} within ${START_TIMEOUT_MS / 1000}s; it printed last:\n${printed.split("\n").slice(-20).join("\n")}`,
  );
}

/**
 * `node harness/cssServer.ts` starts a server and keeps it until Ctrl-C,
 * for JOURNEY_SERVER_URL; `prepare` pulls its images; `clean` takes down
 * what interrupted runs left.
 */
if (import.meta.main) {
  const [command] = process.argv.slice(2);
  if (command === "prepare") {
    await prepare();
  } else if (command === "clean") {
    const taken = await clean();
    console.log(taken.length > 0 ? `Took down ${taken.join(", ")}.` : "Nothing to take down.");
  } else if (command === undefined) {
    const { url, stop } = await startCss();
    for (const signal of ["SIGINT", "SIGTERM"] as const)
      process.once(signal, () => void stop().finally(() => process.exit(0)));
    console.log(
      `${SERVER.name} at ${url} (its log: ${CSS_LOG}). Run the journeys against it with\n  JOURNEY_SERVER_URL=${url} npm run journeys\nCtrl-C stops it.`,
    );
    await new Promise(() => {});
  } else {
    throw new Error("Usage: node harness/cssServer.ts [prepare|clean]");
  }
}
