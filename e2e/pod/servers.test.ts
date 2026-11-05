// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  builtImage,
  composeFile,
  imageKey,
  inputsOf,
  SERVER_IDS,
  SERVERS,
  serversNamed,
  signedInFile,
} from "./servers.ts";

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
    for (const [variable] of text.matchAll(/\$\{[^}]*\}/g))
      expect(["${E2E_PORT:?}", "${E2E_SECRET:?}"]).toContain(variable);
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
    if (server.build === undefined)
      expect(server.image).toMatch(/^[^\s:]+:[^\s@]+@sha256:[0-9a-f]{64}$/);
    else
      expect([server.image, server.pull_policy]).toEqual([
        `localhost/solid-memo-e2e-${id}:local`,
        "never",
      ]);
  });

  it("is limited and given nothing of the host", () => {
    expect(server).toMatchObject({ init: true, security_opt: ["no-new-privileges:true"] });
    if (!(SERVERS[id] as { rootEntrypoint?: true }).rootEntrypoint)
      expect(server.cap_drop).toEqual(["ALL"]);
    expect(server.mem_limit).toBeDefined();
    expect(server.pids_limit).toBeDefined();
    for (const key of [
      "privileged",
      "network_mode",
      "pid",
      "ipc",
      "cap_add",
      "devices",
      "volumes",
      "volumes_from",
    ])
      expect(server).not.toHaveProperty(key);
    expect(text).not.toContain("docker.sock");
  });
});

/**
 * What a signed-in instance's file must say: it runs the server's own
 * image, behind TLS at the port the harness picks, published nowhere else,
 * and given nothing more of the host.
 */
const WITH_SIGNED_IN = SERVER_IDS.filter(
  (id) => (SERVERS[id] as { signedIn?: object }).signedIn !== undefined,
);
/** Compose's own YAML tags, which the parser here need not know. */
const composeTags = [
  { tag: "!override", resolve: (value: unknown) => value, collection: "seq" as const },
  { tag: "!reset", resolve: (value: unknown) => value, collection: "seq" as const },
];

describe.each(WITH_SIGNED_IN)("servers/%s/signed-in.yml", (id) => {
  const text = readFileSync(signedInFile(id), "utf8");
  const { tls, server } = (
    parse(text, { customTags: composeTags as never }) as {
      services: Record<string, Service>;
    }
  ).services as { tls: Service; server: Service };

  it("extends the server's compose file, so it has no image of its own to keep up to date", () => {
    expect(server.extends).toEqual({ file: "compose.yml", service: "server" });
    expect(server).not.toHaveProperty("image");
    expect(server).not.toHaveProperty("build");
  });

  it("is reached only through TLS, at the port its server listens on", () => {
    expect(tls.extends).toEqual({ file: "../compose.tls.yml", service: "tls" });
    expect(tls.environment).toEqual({ E2E_UPSTREAM: String(SERVERS[id].internalPort) });
    expect(server.ports).toEqual([]);
    expect(server.network_mode).toBe("service:tls");
  });

  it("is told its https URL at E2E_PORT, on the host the table says", () => {
    const { host } = (SERVERS[id] as unknown as { signedIn: { host: string } }).signedIn;
    expect(text).toContain(`https://${host}:\${E2E_PORT:?}`);
  });

  it("isn't opened to anyone", () => {
    // Its own command, or the open one's would run; Pivot's image names its configuration in its entrypoint.
    expect(server.command).toBeDefined();
    if (id === "pivot") expect(server.entrypoint).toBeDefined();
    const started = JSON.stringify([server.command, server.entrypoint]);
    for (const open of [
      "--public",
      "config/default.json",
      "acp-e2e.json",
      "pivot-e2e.json",
      "/srv/solid/data",
      "/srv/solid/config",
    ])
      expect(started).not.toContain(open);
  });

  it("is given nothing of the host", () => {
    for (const key of ["privileged", "pid", "ipc", "devices", "volumes", "volumes_from"])
      expect(server).not.toHaveProperty(key);
    expect(text).not.toContain("docker.sock");
  });
});

describe("servers/compose.tls.yml", () => {
  const { tls } = (
    parse(readFileSync(join(import.meta.dirname, "servers/compose.tls.yml"), "utf8")) as {
      services: { tls: Service };
    }
  ).services;

  it("publishes on 127.0.0.1 only, at E2E_PORT", () => {
    expect(tls.ports).toEqual(["127.0.0.1:${E2E_PORT:?}:${E2E_PORT:?}"]);
  });

  it("runs an image pinned by digest, limited, and mounts only its configuration", () => {
    expect(tls.image).toMatch(/^[^\s:]+:[^\s@]+@sha256:[0-9a-f]{64}$/);
    expect(tls).toMatchObject({ cap_drop: ["ALL"], security_opt: ["no-new-privileges:true"] });
    expect(tls.mem_limit).toBeDefined();
    expect(tls.volumes).toEqual(["./Caddyfile:/etc/caddy/Caddyfile:ro"]);
  });
});

describe("the servers' folders", () => {
  it("are the table's, besides the images it builds from", () => {
    const folders = readdirSync(join(import.meta.dirname, "servers"), { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== "nss" &&
          existsSync(join(entry.parentPath, entry.name, "compose.yml")),
      )
      .map((entry) => entry.name);
    expect(folders.sort()).toEqual([...SERVER_IDS].sort());
  });
});

describe("serversNamed", () => {
  it("is the blocking servers when nothing is named", () => {
    expect(serversNamed(undefined)).toEqual(
      SERVER_IDS.filter((id) => SERVERS[id].tier === "blocking"),
    );
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
    expect(
      Object.fromEntries(
        SERVER_IDS.map((id) => [id, `${SERVERS[id].label} ${SERVERS[id].version()}`]),
      ),
    ).toEqual({
      "css-7": expect.stringMatching(/^Community Solid Server 7\.\d+\.\d+$/),
      "css-6": expect.stringMatching(/^Community Solid Server 6\.\d+\.\d+$/),
      "nss-6": expect.stringMatching(/^node-solid-server 6\.\d+\.\d+$/),
      "nss-5": expect.stringMatching(/^node-solid-server 5\.\d+\.\d+$/),
      "css-8": expect.stringMatching(/^Community Solid Server 8\.\d+\.\d+(-[\w.]+)?$/),
      "css-acp": expect.stringMatching(/^Community Solid Server with ACP 7\.\d+\.\d+$/),
      pivot: expect.stringMatching(/^Pivot \d+\.\d+\.\d+ \(Community Solid Server 7\.\d+\.\d+\)$/),
      nextcloud: expect.stringMatching(/^Solid-Nextcloud [0-9a-f]{8} \(Nextcloud 32\.\d+\.\d+\)$/),
      jss: expect.stringMatching(/^JavaScript Solid Server \d+\.\d+\.\d+$/),
      "css-lws": expect.stringMatching(
        /^Community Solid Server with LWS 8\.\d+\.\d+(-[\w.]+)? \([0-9a-f]{8}\)$/,
      ),
    });
  });
});

describe("the workflows' servers", () => {
  const matrix = (workflow: string, job: string) => {
    const text = readFileSync(
      join(import.meta.dirname, "../../.github/workflows", workflow),
      "utf8",
    );
    return (parse(text) as { jobs: Record<string, { strategy: { matrix: { server: string[] } } }> })
      .jobs[job]!.strategy.matrix.server;
  };
  const tier = (wanted: string) => SERVER_IDS.filter((id) => SERVERS[id].tier === wanted);

  it("are the table's: CI tests the blocking ones, with each client, checks the advisory ones start; Interop tests those", () => {
    expect(matrix("ci.yml", "pod")).toEqual(tier("blocking"));
    expect(matrix("ci.yml", "solid-memo-client-pod")).toEqual(tier("blocking"));
    expect(matrix("ci.yml", "contract")).toEqual(tier("advisory"));
    expect(matrix("interop.yml", "pod")).toEqual(tier("advisory"));
  });
});

/** What CI's image cache goes by (.github/actions/e2e-images): it must change whenever a server's images would. */
describe("the images a server runs", () => {
  it.each(SERVER_IDS)(
    "are named for %s by what makes them: a built image by an inputs tag beside its own",
    (id) => {
      const server = (
        parse(readFileSync(composeFile(id), "utf8")) as { services: Record<string, Service> }
      ).services.server!;
      const built = builtImage(id);
      if (server.build === undefined) {
        expect(built).toBeNull();
      } else {
        expect(built?.image).toBe(server.image);
        expect(built?.inputs.startsWith(`${server.image!.replace(/:local$/, "")}:inputs-`)).toBe(
          true,
        );
        expect(built?.inputs).toMatch(/:inputs-[0-9a-f]{16}$/);
      }
      expect(imageKey(id)).toMatch(/^[0-9a-f]{16}$/);
    },
  );

  it("differ from server to server, so no job loads another's", () => {
    expect(new Set(SERVER_IDS.map(imageKey)).size).toBe(SERVER_IDS.length);
  });
});

describe("the hash of what an image is built from (inputsOf)", () => {
  const compose = (args: string) =>
    `services:\n  server:\n    build: { context: ., args: { MAJOR: "${args}" } }\n    image: localhost/x:local\n`;

  function context(): string {
    const dir = mkdtempSync(join(tmpdir(), "inputs-"));
    writeFileSync(join(dir, "compose.yml"), compose("6"));
    writeFileSync(join(dir, "Dockerfile"), "FROM scratch\n");
    mkdirSync(join(dir, "seed"));
    writeFileSync(join(dir, "seed", "start.sh"), "echo\n");
    return dir;
  }

  it("is the same for the same files, and changes with a file, a new file, a file's executable bit or a build argument", () => {
    const dir = context();
    try {
      const file = join(dir, "compose.yml");
      const first = inputsOf(file);
      expect(inputsOf(file)).toBe(first);
      const seen = new Set([first]);
      const changed = (change: () => void) => {
        change();
        const next = inputsOf(file);
        expect(seen.has(next)).toBe(false);
        seen.add(next);
      };
      changed(() => writeFileSync(join(dir, "seed", "start.sh"), "echo hi\n"));
      changed(() => writeFileSync(join(dir, "seed", "more.ttl"), "<#a> <#b> <#c> .\n"));
      changed(() => chmodSync(join(dir, "seed", "start.sh"), 0o755));
      changed(() => writeFileSync(file, compose("5")));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("leaves out what .dockerignore keeps from the build, and refuses a pattern it does not know", () => {
    const dir = context();
    try {
      const file = join(dir, "compose.yml");
      writeFileSync(join(dir, ".dockerignore"), "expected-failures.json\n**/node_modules\n");
      const before = inputsOf(file);
      writeFileSync(join(dir, "expected-failures.json"), "{}\n");
      mkdirSync(join(dir, "seed", "node_modules"));
      writeFileSync(join(dir, "seed", "node_modules", "x.js"), "\n");
      expect(inputsOf(file)).toBe(before);
      writeFileSync(join(dir, ".dockerignore"), "*.log\n");
      expect(() => inputsOf(file)).toThrow(/does not know/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is null for an image that is pulled", () => {
    expect(inputsOf(composeFile("css-7"))).toBeNull();
  });
});
