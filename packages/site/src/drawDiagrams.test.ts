// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkSvg,
  type Diagram,
  DiagramError,
  type DrawInputs,
  diagramsOf,
  fontNotice,
} from "./diagrams.ts";
import {
  type DrawingBrowser,
  type DrawingPage,
  diagramMode,
  drawDiagrams,
  drawInputs,
  type Launch,
} from "./drawDiagrams.ts";

let inputs: DrawInputs;
beforeAll(async () => {
  inputs = await drawInputs();
});

const block = (...lines: string[]) =>
  ["```mermaid", "flowchart LR", "  accTitle: T", "  accDescr: D.", ...lines, "```"].join("\n");
const diagramsFrom = (...blocks: string[]) =>
  diagramsOf("docs/page.md", blocks.join("\n\n"), inputs);

/**
 * A browser that runs the drawing page's callbacks in node, with a fake
 * Mermaid: it draws a block as a small SVG, and refuses one that says
 * BROKEN (with Mermaid's message), THROWN (with a bare string) or draws
 * one with HTML in it for UNSAFE.
 */
function fakeBrowser() {
  const calls: string[] = [];
  const configs: Record<string, unknown>[] = [];
  vi.stubGlobal("document", {
    fonts: { load: async (font: string) => void calls.push(`font ${font}`) },
  });
  vi.stubGlobal("mermaid", {
    initialize: (config: Record<string, unknown>) => void configs.push(config),
    render: async (id: string, text: string) => {
      if (text.includes("BROKEN"))
        throw new Error(
          "Parse error on line 5:\n...BROKEN\n---^\nExpecting 'SEMI', got 'NODE_STRING'",
        );
      if (text.includes("THROWN")) throw "a bare string";
      const extra = text.includes("UNSAFE") ? "<foreignObject/>" : "";
      return {
        svg: `<svg id="${id}" viewBox="0 0 10 10"><style>#${id}{font-family:"Fredoka";}</style>${extra}<text>${configs.at(-1)!.theme}</text></svg>`,
      };
    },
  });
  const pages: string[] = [];
  const browser: DrawingBrowser & { closed: boolean } = {
    closed: false,
    async newPage(): Promise<DrawingPage> {
      return {
        setContent: async (html) => void calls.push(`content ${html}`),
        addStyleTag: async ({ content }) => calls.push(`style ${content.slice(0, 45)}`),
        addScriptTag: async ({ path }) =>
          calls.push(`script ${path.split("/").slice(-3).join("/")}`),
        evaluate: async (callback, arg) => callback(arg),
        close: async () => void pages.push("closed"),
      };
    },
    async close() {
      browser.closed = true;
    },
  };
  const launch = vi.fn<Launch>(async () => browser);
  return { browser, launch, calls, configs, pages };
}

describe("drawDiagrams", () => {
  let cacheDir: string;
  beforeEach(async () => {
    cacheDir = join(await mkdtemp(join(tmpdir(), "solid-memo-diagrams-")), "cache");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const cached = async () => (await readdir(cacheDir)).sort();

  it("draws what is not cached, light and dark, with the font and its notice, and caches it", async () => {
    const fake = fakeBrowser();
    const [diagram] = diagramsFrom(block("A --> B"));
    const drawn = await drawDiagrams([diagram!, diagram!], {
      inputs,
      cacheDir,
      launch: fake.launch,
    });
    const drawing = drawn!.get(diagram!.hash)!;
    expect(fake.launch).toHaveBeenCalledOnce();
    expect(fake.browser.closed).toBe(true);
    expect(fake.pages).toEqual(["closed", "closed"]);
    expect(fake.configs.map((config) => config.theme)).toEqual(["default", "dark"]);
    expect(fake.calls).toContain('font 16px "Fredoka"');
    expect(fake.calls).toContain("script mermaid/dist/mermaid.min.js");
    expect(fake.calls).toContain('style @font-face{font-family:"Fredoka";src:url(data');
    for (const svg of [drawing.light, drawing.dark]) {
      expect(svg).toContain(fontNotice(inputs.license));
      expect(svg).toContain("@font-face");
      expect(checkSvg(svg)).toBeNull();
    }
    expect(drawing.light).toContain("<text>default</text>");
    expect(drawing.dark).toContain("<text>dark</text>");
    expect(await cached()).toEqual(
      [`${diagram!.keys.dark}.svg`, `${diagram!.keys.light}.svg`].sort(),
    );
    expect(await readFile(join(cacheDir, `${diagram!.keys.light}.svg`), "utf8")).toBe(
      drawing.light,
    );
  });

  it("launches no browser when every drawing is cached", async () => {
    const fake = fakeBrowser();
    const diagrams = diagramsFrom(block("A --> B"), block("B --> C"));
    const first = await drawDiagrams(diagrams, { inputs, cacheDir, launch: fake.launch });
    const launch = vi.fn<Launch>(async () => {
      throw new Error("not to be launched");
    });
    expect(await drawDiagrams(diagrams, { inputs, cacheDir, launch })).toEqual(first);
    expect(launch).not.toHaveBeenCalled();
  });

  it("draws only the theme that is missing", async () => {
    const fake = fakeBrowser();
    const [diagram] = diagramsFrom(block("A --> B"));
    await drawDiagrams([diagram!], { inputs, cacheDir, launch: fake.launch });
    await writeFile(
      join(cacheDir, `${diagram!.keys.dark}.svg`),
      "<svg><script>alert(1)</script></svg>",
    );
    const again = fakeBrowser();
    const drawn = await drawDiagrams([diagram!], { inputs, cacheDir, launch: again.launch });
    expect(again.configs.map((config) => config.theme)).toEqual(["dark"]);
    expect(again.pages).toEqual(["closed"]);
    expect(checkSvg(drawn!.get(diagram!.hash)!.dark)).toBeNull();
    expect(await readFile(join(cacheDir, `${diagram!.keys.dark}.svg`), "utf8")).toContain(
      "<text>dark</text>",
    );
  });

  it("writes each drawing under a temporary name, then renames it into place", async () => {
    const fake = fakeBrowser();
    const diagrams = diagramsFrom(block("A --> B"), block("B --> C"), block("C --> D"));
    await drawDiagrams(diagrams, { inputs, cacheDir, launch: fake.launch });
    const names = await cached();
    expect(names).toHaveLength(6);
    expect(names.every((name) => /^[0-9a-f]{64}\.svg$/.test(name))).toBe(true);
  });

  it("fails on a block Mermaid refuses, at the page's line, once for both themes, and closes the browser", async () => {
    const fake = fakeBrowser();
    const diagrams = diagramsFrom(block("A --> B"), block("BROKEN"), block("THROWN"));
    const failure = await drawDiagrams(diagrams, { inputs, cacheDir, launch: fake.launch }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DiagramError);
    expect((failure as DiagramError).problems).toEqual([
      {
        file: "docs/page.md",
        line: 8 + 5,
        what: "Parse error:\n...BROKEN\n---^\nExpecting 'SEMI', got 'NODE_STRING'",
      },
      { file: "docs/page.md", line: 15, what: "a bare string" },
    ]);
    expect(fake.browser.closed).toBe(true);
    // What was drawn is kept, for the next build.
    expect(await cached()).toHaveLength(2);
  });

  it("fails on a drawing that checkSvg refuses, and caches none of it", async () => {
    const fake = fakeBrowser();
    const diagrams = diagramsFrom(block("UNSAFE"));
    await expect(drawDiagrams(diagrams, { inputs, cacheDir, launch: fake.launch })).rejects.toThrow(
      "docs/page.md:1: Mermaid's drawing has a <foreignObject> element",
    );
    expect(await cached()).toEqual([]);
  });

  it("names the install command when Chromium does not start", async () => {
    const cause = new Error("browserType.launch: Executable doesn't exist at /x/chrome\n╔═══╗");
    const failure = await drawDiagrams(diagramsFrom(block("A --> B")), {
      inputs,
      cacheDir,
      launch: async () => {
        throw cause;
      },
    }).then(
      () => new Error("drew"),
      (error: unknown) => error as Error,
    );
    expect(failure.message).toBe(
      [
        "Drawing 2 of the docs' diagrams needs Chromium, which did not start:",
        "  browserType.launch: Executable doesn't exist at /x/chrome",
        "Install it once with `npm run browsers` (on Linux, if it lacks system libraries:",
        "`sudo npx playwright install-deps chromium`).",
      ].join("\n"),
    );
    expect(failure.cause).toBe(cause);
  });

  it("draws nothing without Chromium when drawing is optional, and says so", async () => {
    const warn = vi.fn();
    const options = {
      inputs,
      cacheDir,
      mode: "optional" as const,
      launch: async () => {
        throw "no browser";
      },
    };
    expect(await drawDiagrams(diagramsFrom(block("A --> B")), { ...options, warn })).toBeNull();
    expect(warn.mock.calls[0]![0]).toMatch(
      /^Drawing 2 of the docs' diagrams needs Chromium, which did not start:\n {2}no browser\n[\s\S]*\nThe docs are shown without their diagrams\.$/,
    );
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await drawDiagrams(diagramsFrom(block("A --> B")), options)).toBeNull();
    expect(consoleWarn).toHaveBeenCalledOnce();
  });

  it("draws nothing under skip, even from the cache, and starts no browser", async () => {
    const fake = fakeBrowser();
    const diagrams = diagramsFrom(block("A --> B"));
    await drawDiagrams(diagrams, { inputs, cacheDir, launch: fake.launch });
    const launch = vi.fn<Launch>();
    const warn = vi.fn();
    expect(
      await drawDiagrams(diagrams, { inputs, cacheDir, mode: "skip", launch, warn }),
    ).toBeNull();
    expect(launch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "DOCS_DIAGRAMS=skip: the docs are built without their diagrams.",
    );
  });

  it("draws nothing for a page without diagrams", async () => {
    expect(await drawDiagrams([], { inputs, cacheDir })).toEqual(new Map());
  });
});

describe("diagramMode", () => {
  it("is required unless DOCS_DIAGRAMS says skip, in CI too", () => {
    expect(diagramMode({})).toBe("required");
    expect(diagramMode({ DOCS_DIAGRAMS: "" })).toBe("required");
    expect(diagramMode({ DOCS_DIAGRAMS: "skip" })).toBe("skip");
    expect(diagramMode({ DOCS_DIAGRAMS: "skip", CI: "true" })).toBe("skip");
    expect(() => diagramMode({ DOCS_DIAGRAMS: "off" })).toThrow('DOCS_DIAGRAMS is "off"');
  });
});

/**
 * The one test of the real browser: Playwright's Chromium and the
 * official Mermaid, a diagram of each kind the docs use. Skipped only
 * under DOCS_DIAGRAMS=skip, which leaves the default launch uncovered,
 * so npm run check fails then (docs/testing.md).
 */
describe("in Chromium", () => {
  const skipped = process.env.DOCS_DIAGRAMS === "skip";

  it.skipIf(skipped)(
    "draws a flowchart, a sequence diagram and a state diagram, light and dark",
    async () => {
      const cacheDir = await mkdtemp(join(tmpdir(), "solid-memo-diagrams-"));
      const text = [
        "```mermaid",
        "flowchart LR",
        "  accTitle: A flowchart",
        "  accDescr: Two steps.",
        "  A[answer graded q] -- yes --> B{q at least 3?}",
        "```",
        "```mermaid",
        "sequenceDiagram",
        "  accTitle: A sequence",
        "  accDescr: One message.",
        "  User->>UI: log in",
        "```",
        "```mermaid",
        "stateDiagram-v2",
        "  accTitle: A state diagram",
        "  accDescr: Two states.",
        "  [*] --> Guest: try it",
        "  Guest --> [*]",
        "```",
      ].join("\n");
      const diagrams: Diagram[] = diagramsOf("docs/real.md", text, inputs);
      const drawn = await drawDiagrams(diagrams, { inputs, cacheDir });
      for (const diagram of diagrams) {
        const { light, dark } = drawn!.get(diagram.hash)!;
        for (const svg of [light, dark]) {
          expect(checkSvg(svg)).toBeNull();
          expect(svg).toContain(fontNotice(inputs.license));
          expect(svg).toContain(
            `<title id="chart-title-diagram-${diagram.hash.slice(0, 8)}">${diagram.title}</title>`,
          );
        }
        expect(light).not.toBe(dark);
      }
      expect(await readdir(cacheDir)).toHaveLength(6);
    },
    120_000,
  );
});
