import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { turtleDirectoryPlugin } from "./publishTurtle.ts";

describe("turtleDirectoryPlugin", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "solid-memo-publish-"));
    await mkdir(join(dir, "deck"));
    await writeFile(join(dir, "v1.ttl"), "top");
    await writeFile(join(dir, "deck", "v2.ttl"), "nested");
    await writeFile(join(dir, "notes.md"), "no");
  });

  type Handler = (
    req: { url?: string },
    res: { setHeader: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> },
    next: ReturnType<typeof vi.fn>,
  ) => Promise<void>;

  function devHandler(options: { dir: string; publicPath?: string }): Handler {
    const plugin = turtleDirectoryPlugin(options);
    let handler: Handler | undefined;
    const server = { middlewares: { use: (h: Handler) => (handler = h) } };
    (plugin.configureServer as (s: unknown) => void)(server);
    return handler!;
  }

  async function request(url: string | undefined, options: { dir: string; publicPath?: string } = { dir, publicPath: "vendor" }) {
    const res = { setHeader: vi.fn(), end: vi.fn() };
    const next = vi.fn();
    await devHandler(options)({ url }, res, next);
    return { res, next };
  }

  it("serves Turtle files, nested ones too, as text/turtle", async () => {
    const top = await request("/vendor/v1.ttl?t=1");
    expect(top.res.setHeader).toHaveBeenCalledWith("Content-Type", "text/turtle; charset=utf-8");
    expect(top.res.end).toHaveBeenCalledWith("top");
    const nested = await request("/vendor/deck/v2.ttl");
    expect(nested.res.end).toHaveBeenCalledWith("nested");
    expect(nested.next).not.toHaveBeenCalled();
  });

  it("passes other requests on", async () => {
    for (const url of [
      "/index.html",
      "/vendor/missing.ttl",
      "/vendor/notes.md",
      "/vendor/../package.json",
      "/vendor/.hidden.ttl",
      "/vendor/deck//v2.ttl",
      undefined,
    ]) {
      const { res, next } = await request(url);
      expect(res.end, url).not.toHaveBeenCalled();
      expect(next, url).toHaveBeenCalledWith();
    }
  });

  it("uses the folder name as the public path by default", async () => {
    const { res } = await request(`/${dir.split("/").at(-1)}/v1.ttl`, { dir });
    expect(res.end).not.toHaveBeenCalled();
  });

  it("reports a folder that cannot be read to the dev server", async () => {
    const { next } = await request("/vendor/v1.ttl", { dir: join(dir, "missing"), publicPath: "vendor" });
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("emits the Turtle files into the build", async () => {
    const plugin = turtleDirectoryPlugin({ dir, publicPath: "vendor" });
    const emitFile = vi.fn();
    await (
      plugin.generateBundle as unknown as (this: { emitFile: typeof emitFile }) => Promise<void>
    ).call({ emitFile });
    expect(emitFile.mock.calls.map((c) => [c[0].fileName, c[0].source])).toEqual([
      ["vendor/deck/v2.ttl", "nested"],
      ["vendor/v1.ttl", "top"],
    ]);
  });
});
