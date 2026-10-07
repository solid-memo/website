import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { composeFile, SERVER_IDS, SERVERS, serversNamed } from "./servers.ts";

interface Service {
  image?: string;
  build?: unknown;
  pull_policy?: string;
  command?: string[];
  ports?: string[];
  [key: string]: unknown;
}

/**
 * What every server's compose file must say, so the harness can run any
 * of them alike and none reaches past this machine: published only on
 * 127.0.0.1 at the port the harness picks, told its URL there, pinned,
 * limited, and given nothing of the host.
 */
describe.each(SERVER_IDS)("servers/%s/compose.yml", (id) => {
  const text = readFileSync(composeFile(id), "utf8");
  const services = (parse(text) as { services: Record<string, Service> }).services;
  const server = services.server!;

  it("has the one service, server", () => {
    expect(Object.keys(services)).toEqual(["server"]);
  });

  it("asks only for E2E_PORT and E2E_SECRET, both required", () => {
    for (const [variable] of text.matchAll(/\$\{[^}]*\}/g)) expect(["${E2E_PORT:?}", "${E2E_SECRET:?}"]).toContain(variable);
  });

  it("is published on 127.0.0.1 only, at E2E_PORT, from the port the table says", () => {
    expect(server.ports).toEqual([`127.0.0.1:\${E2E_PORT:?}:${SERVERS[id].internalPort}`]);
  });

  it("is told its URL on 127.0.0.1 at E2E_PORT, or the port to make it from, unless it makes it from each request", () => {
    const told = server.command?.some((arg) => arg.startsWith("http://127.0.0.1:${E2E_PORT:?}"));
    const environment = server.environment as Record<string, string> | undefined;
    const fromHost = (SERVERS[id] as { urlFromHost?: true }).urlFromHost === true;
    expect(told || environment?.E2E_PORT === "${E2E_PORT:?}" || fromHost).toBe(true);
  });

  it("runs an image pinned by digest, or one it builds and never pulls", () => {
    if (server.build === undefined) expect(server.image).toMatch(/^[^\s:]+:[^\s@]+@sha256:[0-9a-f]{64}$/);
    else expect([server.image, server.pull_policy]).toEqual([`localhost/solid-memo-e2e-${id}:local`, "never"]);
  });

  it("is limited and given nothing of the host", () => {
    expect(server).toMatchObject({ init: true, security_opt: ["no-new-privileges:true"] });
    if (!(SERVERS[id] as { rootEntrypoint?: true }).rootEntrypoint) expect(server.cap_drop).toEqual(["ALL"]);
    expect(server.mem_limit).toBeDefined();
    expect(server.pids_limit).toBeDefined();
    for (const key of ["privileged", "network_mode", "pid", "ipc", "cap_add", "devices", "volumes", "volumes_from"]) expect(server).not.toHaveProperty(key);
    expect(text).not.toContain("docker.sock");
  });
});

describe("the servers' folders", () => {
  it("are the table's, besides the images it builds from", () => {
    const folders = readdirSync(join(import.meta.dirname, "servers"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "nss" && existsSync(join(entry.parentPath, entry.name, "compose.yml")))
      .map((entry) => entry.name);
    expect(folders.sort()).toEqual([...SERVER_IDS].sort());
  });
});

describe("serversNamed", () => {
  it("is the blocking servers when nothing is named", () => {
    expect(serversNamed(undefined)).toEqual(SERVER_IDS.filter((id) => SERVERS[id].tier === "blocking"));
    expect(serversNamed(" ")).toEqual(serversNamed(undefined));
  });

  it("is every server for all", () => {
    expect(serversNamed("all")).toEqual(SERVER_IDS);
  });

  it("is the servers named, in that order", () => {
    expect(serversNamed("nss-5, css-7")).toEqual(["nss-5", "css-7"]);
  });

  it("refuses a name it does not know", () => {
    expect(() => serversNamed("css-7,bogus")).toThrow(/names no server bogus/);
  });
});

describe("the names in the tests", () => {
  it("say the server and the version it is pinned to", () => {
    expect(Object.fromEntries(SERVER_IDS.map((id) => [id, `${SERVERS[id].label} ${SERVERS[id].version()}`]))).toEqual({
      "css-7": expect.stringMatching(/^Community Solid Server 7\.\d+\.\d+$/),
      "css-6": expect.stringMatching(/^Community Solid Server 6\.\d+\.\d+$/),
      "nss-6": expect.stringMatching(/^node-solid-server 6\.\d+\.\d+$/),
      "nss-5": expect.stringMatching(/^node-solid-server 5\.\d+\.\d+$/),
      "css-8": expect.stringMatching(/^Community Solid Server 8\.\d+\.\d+(-[\w.]+)?$/),
      pivot: expect.stringMatching(/^Pivot \d+\.\d+\.\d+ \(Community Solid Server 7\.\d+\.\d+\)$/),
      nextcloud: expect.stringMatching(/^Solid-Nextcloud [0-9a-f]{8} \(Nextcloud 32\.\d+\.\d+\)$/),
      jss: expect.stringMatching(/^JavaScript Solid Server \d+\.\d+\.\d+$/),
    });
  });
});

describe("the workflows' servers", () => {
  const matrix = (workflow: string, job: string) => {
    const text = readFileSync(join(import.meta.dirname, "../../.github/workflows", workflow), "utf8");
    return (parse(text) as { jobs: Record<string, { strategy: { matrix: { server: string[] } } }> }).jobs[job]!.strategy.matrix.server;
  };
  const tier = (wanted: string) => SERVER_IDS.filter((id) => SERVERS[id].tier === wanted);

  it("are the table's: CI tests the blocking ones, checks the advisory ones start; Interop tests those", () => {
    expect(matrix("ci.yml", "pod")).toEqual(tier("blocking"));
    expect(matrix("ci.yml", "contract")).toEqual(tier("advisory"));
    expect(matrix("interop.yml", "pod")).toEqual(tier("advisory"));
  });
});
