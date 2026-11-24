// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Audit,
  type AuditIo,
  defaultIo,
  main,
  PAUSE,
  run,
  TRIES,
  unreachable,
} from "./auditSignatures.ts";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
});

const PASSED: Audit = {
  status: 0,
  stdout: "audited 1306 packages\n\n1306 packages have verified registry signatures\n",
  stderr: "",
};

/** The registry's answer of `OK` to an attestation request. */
const NOT_JSON: Audit = {
  status: 1,
  stdout: "",
  stderr: [
    "npm error code FETCH_ERROR",
    "npm error errno FETCH_ERROR",
    "npm error invalid json response body at https://registry.npmjs.org/-/npm/v1/attestations/@inrupt%2fsolid-client-errors@0.0.4 reason: Unexpected token 'O', \"OK",
    'npm error " is not valid JSON',
    "",
  ].join("\n"),
};

const INVALID: Audit = {
  status: 1,
  stdout: [
    "audited 1306 packages",
    "",
    "1 package has an invalid registry signature:",
    "",
    "left-pad@1.3.0 (https://registry.npmjs.org/)",
    "",
    "Someone might have tampered with this package since it was published on the registry!",
    "",
  ].join("\n"),
  stderr: "",
};

/** An io whose npm answers each run with the next of `audits`. */
function fakeIo(...audits: Audit[]) {
  const runs: (readonly string[])[] = [];
  const printed: Audit[] = [];
  const waits: number[] = [];
  const warnings: string[] = [];
  const io: AuditIo = {
    audit: (args) => {
      runs.push(args);
      return audits[runs.length - 1]!;
    },
    wait: async (ms) => {
      waits.push(ms);
    },
    print: (audit) => printed.push(audit),
    warn: (message) => warnings.push(message),
  };
  return { io, runs, printed, waits, warnings };
}

describe("unreachable", () => {
  it.each([
    "FETCH_ERROR",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "E429",
    "E500",
    "E503",
  ])("counts npm's %s as an answer it couldn't fetch", (code) => {
    expect(unreachable(`npm error code ${code}\nnpm error something\n`)).toBe(true);
  });

  it.each([
    ["an invalid signature", INVALID.stdout],
    ["an attestation that didn't verify", "npm error code EATTESTATIONVERIFY\n"],
    ["a package the registry doesn't have", "npm error code E404\n"],
    ["a refused request", "npm error code E403\n"],
    ["a code named in a message", "npm error something about FETCH_ERROR\n"],
    ["a longer code", "npm error code E5000\n"],
  ])("doesn't count %s", (_, output) => {
    expect(unreachable(output)).toBe(false);
  });
});

describe("main", () => {
  it("runs npm once when the audit passes", async () => {
    const fake = fakeIo(PASSED);
    expect(await main(["--prefix", "scripts/renovate"], fake.io)).toBe(0);
    expect(fake.runs).toEqual([["--prefix", "scripts/renovate"]]);
    expect(fake.printed).toEqual([PASSED]);
    expect(fake.warnings).toEqual([]);
  });

  it("fails at once on an invalid signature", async () => {
    const fake = fakeIo(INVALID, PASSED);
    expect(await main([], fake.io)).toBe(1);
    expect(fake.runs).toEqual([[]]);
    expect(fake.printed).toEqual([INVALID]);
    expect(fake.waits).toEqual([]);
  });

  it("asks again, fetching every record again, when the answer couldn't be read", async () => {
    const fake = fakeIo(NOT_JSON, PASSED);
    expect(await main(["--prefix", "scripts/renovate"], fake.io)).toBe(0);
    expect(fake.runs).toEqual([
      ["--prefix", "scripts/renovate"],
      ["--prefix", "scripts/renovate", "--prefer-online"],
    ]);
    expect(fake.printed).toEqual([NOT_JSON, PASSED]);
    expect(fake.waits).toEqual([PAUSE]);
    expect(fake.warnings).toEqual([
      `npm audit signatures could not read the registry's answer (try 1 of ${TRIES})`,
    ]);
  });

  it("fails on an invalid signature found on a later try", async () => {
    const fake = fakeIo(NOT_JSON, INVALID, PASSED);
    expect(await main([], fake.io)).toBe(1);
    expect(fake.runs).toHaveLength(2);
  });

  it("gives up after its last try", async () => {
    const fake = fakeIo(...Array.from({ length: TRIES + 1 }, () => NOT_JSON));
    expect(await main([], fake.io)).toBe(1);
    expect(fake.runs).toHaveLength(TRIES);
    expect(fake.waits).toHaveLength(TRIES - 1);
    expect(fake.warnings.at(-1)).toBe(
      `npm audit signatures could not read the registry's answer (try ${TRIES - 1} of ${TRIES})`,
    );
  });

  it("reads the error from stdout too", async () => {
    const fake = fakeIo({ ...NOT_JSON, stdout: NOT_JSON.stderr, stderr: "" }, PASSED);
    expect(await main([], fake.io)).toBe(0);
    expect(fake.runs).toHaveLength(2);
  });
});

describe("defaultIo", () => {
  it("runs npm audit signatures with the arguments", () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 1,
      stdout: "out",
      stderr: "err",
    } as ReturnType<typeof spawnSync>);
    expect(defaultIo().audit(["--prefer-online"])).toEqual({
      status: 1,
      stdout: "out",
      stderr: "err",
    });
    expect(spawnSync).toHaveBeenCalledWith("npm", ["audit", "signatures", "--prefer-online"], {
      encoding: "utf8",
    });
  });

  it("counts npm killed by a signal as a failure", () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: null,
      stdout: "",
      stderr: "",
    } as unknown as ReturnType<typeof spawnSync>);
    expect(defaultIo().audit([]).status).toBe(1);
  });

  it("prints npm's output, each stream to its own", () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    defaultIo().print({ status: 1, stdout: "out", stderr: "err" });
    expect(out).toHaveBeenCalledWith("out");
    expect(err).toHaveBeenCalledWith("err");
  });

  it("warns with a workflow command", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo().warn("careful");
    expect(log).toHaveBeenCalledWith("::warning::careful");
  });

  it("waits", async () => {
    vi.useFakeTimers();
    let done = false;
    const waited = defaultIo()
      .wait(PAUSE)
      .then(() => {
        done = true;
      });
    await vi.advanceTimersByTimeAsync(PAUSE - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waited;
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});

describe("run", () => {
  it("passes its arguments to npm and sets the exit code", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.mocked(spawnSync).mockReturnValueOnce(PASSED as unknown as ReturnType<typeof spawnSync>);
    const entry: { argv: string[]; exitCode?: number } = {
      argv: ["node", "--prefix", "scripts/renovate"],
    };
    await run(entry);
    expect(entry.exitCode).toBe(0);
    expect(spawnSync).toHaveBeenLastCalledWith(
      "npm",
      ["audit", "signatures", "--prefix", "scripts/renovate"],
      { encoding: "utf8" },
    );
  });
});
