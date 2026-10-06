import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OUTPUTS, defaultIo, main, render, run, type GenerateIo } from "./generate.ts";
import { VOCAB_ROOT } from "./root.ts";

/** This package's folder, not the working directory: the root's vitest.config.ts runs these tests from the repository's root. */
const ROOT = VOCAB_ROOT;

describe("render", () => {
  it("matches the committed generated files (run `npm run generate` otherwise)", async () => {
    const outputs = await render(defaultIo(ROOT));
    for (const path of Object.values(OUTPUTS)) {
      expect(outputs[path], path).toBe(await readFile(`${ROOT}${path}`, "utf8"));
    }
  });
});

function fakeIo(committed: Record<string, string>): GenerateIo & { written: Record<string, string>; logs: string[] } {
  const real = defaultIo(ROOT);
  const io = {
    written: {} as Record<string, string>,
    logs: [] as string[],
    readFile: (path: string) =>
      path in committed
        ? Promise.resolve(committed[path])
        : path.startsWith("src/")
          ? Promise.reject(new Error("missing"))
          : real.readFile(path),
    writeFile: async (path: string, text: string) => {
      io.written[path] = text;
    },
    readNs: real.readNs,
    readTurtleTree: real.readTurtleTree,
    log: (message: string) => io.logs.push(message),
  };
  return io;
}

describe("main", () => {
  it("writes every output", async () => {
    const io = fakeIo({});
    expect(await main([], io)).toBe(0);
    expect(Object.keys(io.written)).toEqual(Object.values(OUTPUTS));
    expect(io.logs).toEqual(Object.values(OUTPUTS).map((path) => `wrote ${path}`));
  });

  it("checks without writing, reporting drift and missing files", async () => {
    const outputs = await render(defaultIo(ROOT));
    const upToDate = fakeIo(outputs);
    expect(await main(["--check"], upToDate)).toBe(0);
    expect(upToDate.written).toEqual({});
    const drifted = fakeIo({ ...outputs, [OUTPUTS.vocab]: "stale" });
    expect(await main(["--check"], drifted)).toBe(1);
    expect(drifted.logs).toEqual([
      `${OUTPUTS.vocab} is out of date: run \`npm run generate\`.`,
    ]);
    const missing = fakeIo({ [OUTPUTS.vocab]: outputs[OUTPUTS.vocab] });
    expect(await main(["--check"], missing)).toBe(1);
    expect(missing.logs).toHaveLength(Object.keys(OUTPUTS).length - 1);
  });
});

describe("run", () => {
  it("sets the exit code from the repository's own files", async () => {
    const process = { argv: ["node", "--check"], cwd: () => ROOT, exitCode: undefined as number | undefined };
    await run(process);
    expect(process.exitCode).toBe(0);
  });

  it("writes relative to its root", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solid-memo-generate-"));
    await defaultIo(dir).writeFile("out.txt", "hello");
    expect(await readFile(join(dir, "out.txt"), "utf8")).toBe("hello");
  });

  it("logs through the console", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo(ROOT).log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});
