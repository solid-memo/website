import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { builtAppPlugin } from "./publishApp.ts";

describe("builtAppPlugin", () => {
  it("emits every file of the app's build under its path, in the build only", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solid-memo-app-"));
    await mkdir(join(dir, "assets"));
    await writeFile(join(dir, "index.html"), "<!doctype html>");
    await writeFile(join(dir, "assets", "index.js"), "run()");

    const plugin = builtAppPlugin({ dir, publicPath: "studio" });
    expect(plugin.apply).toBe("build");
    const emitFile = vi.fn();
    await (
      plugin.generateBundle as unknown as (this: {
        emitFile: typeof emitFile;
      }) => Promise<void>
    ).call({ emitFile });
    expect(
      emitFile.mock.calls.map(([file]) => [
        file.type,
        file.fileName,
        String(file.source),
      ]),
    ).toEqual([
      ["asset", "studio/assets/index.js", "run()"],
      ["asset", "studio/index.html", "<!doctype html>"],
    ]);
  });

  it("warns and publishes nothing when the app has no build", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "solid-memo-app-")), "dist");
    const plugin = builtAppPlugin({ dir, publicPath: "studio" });
    const emitFile = vi.fn();
    const warn = vi.fn();
    await (
      plugin.generateBundle as unknown as (this: {
        emitFile: typeof emitFile;
        warn: typeof warn;
      }) => Promise<void>
    ).call({ emitFile, warn });
    expect(emitFile).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("nothing is published at studio/"),
    );
  });
});
