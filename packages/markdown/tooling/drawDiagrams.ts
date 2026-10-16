// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium } from "playwright";
import {
  checkSvg,
  type Diagram,
  DiagramError,
  type DiagramProblem,
  type DrawInputs,
  diagramTheme,
  embedFont,
  FONT_FAMILY,
  fontFace,
  fontNotice,
  mermaidError,
  rendererHash,
  THEMES,
  type Theme,
} from "./diagrams.ts";

/**
 * Drawing the docs' diagrams (docs/markdown.md, Diagrams): the official
 * Mermaid in Chromium, through Playwright, light and dark, each drawing
 * cached by its key. A build that finds every drawing in the cache
 * launches no browser.
 */

const require = createRequire(import.meta.url);

/** Mermaid's bundle as one file, which the drawing page loads. */
const MERMAID_JS = require.resolve("mermaid/dist/mermaid.min.js");
/** Fredoka's Latin file, embedded in each drawing. */
const FONT_FILE = require.resolve(
  "@fontsource-variable/fredoka/files/fredoka-latin-wght-normal.woff2",
);
/** Fredoka's copyright line and license, the SIL Open Font License 1.1. */
export const FONT_LICENSE_FILE = require.resolve("@fontsource-variable/fredoka/LICENSE");

/** Where drawings are kept between builds, one file per drawing; `npm ci` empties it. */
export const CACHE_DIR = join(
  import.meta.dirname,
  "../../../node_modules/.cache/solid-memo-docs-diagrams",
);

/** What the drawings depend on besides their source, read from the installed packages and this code. */
export async function drawInputs(): Promise<DrawInputs> {
  const version = async (name: string) =>
    (
      JSON.parse(await readFile(require.resolve(`${name}/package.json`), "utf8")) as {
        version: string;
      }
    ).version;
  const source = (name: string) => readFile(new URL(name, import.meta.url), "utf8");
  return {
    mermaid: await version("mermaid"),
    playwright: await version("playwright"),
    font: await readFile(FONT_FILE),
    license: await readFile(FONT_LICENSE_FILE, "utf8"),
    renderer: rendererHash([await source("./diagrams.ts"), await source("./drawDiagrams.ts")]),
  };
}

/**
 * How diagrams are drawn: `required` fails without Chromium; `skip`
 * (DOCS_DIAGRAMS=skip) draws none and starts no browser, with a warning,
 * so what a build makes depends on the setting alone, which Turbo hashes,
 * not on whether Chromium is there; `optional`, the dev server's, draws
 * when Chromium starts and warns when it does not.
 */
export type DrawMode = "required" | "optional" | "skip";

/** The mode `DOCS_DIAGRAMS` asks a build for: `skip`, or `required` when unset. */
export function diagramMode(env: Record<string, string | undefined>): "required" | "skip" {
  const asked = env.DOCS_DIAGRAMS ?? "";
  if (asked === "") return "required";
  if (asked !== "skip") throw new Error(`DOCS_DIAGRAMS is "${asked}": only "skip" is known.`);
  return "skip";
}

/** The part of a Playwright page drawing uses. */
export type DrawingPage = {
  setContent(html: string): Promise<void>;
  addStyleTag(options: { content: string }): Promise<unknown>;
  addScriptTag(options: { path: string }): Promise<unknown>;
  evaluate<Result, Arg>(
    callback: (arg: Arg) => Result | Promise<Result>,
    arg: Arg,
  ): Promise<Result>;
  close(): Promise<void>;
};

/** The part of a Playwright browser drawing uses. */
export type DrawingBrowser = { newPage(): Promise<DrawingPage>; close(): Promise<void> };

/** Starts the browser: Playwright's headless Chromium, or a fake in tests. */
export type Launch = () => Promise<DrawingBrowser>;

const launchChromium: Launch = () => chromium.launch();

/** A diagram's two drawings. */
export type Drawing = Record<Theme, string>;

/** What a drawing page renders, and what comes back for each. */
type Job = { id: string; source: string };
type Rendered = { svg: string } | { error: string };

/** Waits for the font in the drawing page, so the first diagram is measured with it. Runs in the browser. */
async function loadFont(family: string): Promise<void> {
  await document.fonts.load(`16px "${family}"`);
}

/** Renders each job with Mermaid, set up anew for each. Runs in the browser. */
async function renderAll({
  config,
  jobs,
}: {
  config: Record<string, unknown>;
  jobs: Job[];
}): Promise<Rendered[]> {
  const out: Rendered[] = [];
  for (const job of jobs) {
    mermaid.initialize(config);
    try {
      out.push({ svg: (await mermaid.render(job.id, job.source)).svg });
    } catch (error) {
      out.push({ error: error instanceof Error ? error.message : String(error) });
    }
  }
  return out;
}

const launchFailed = (count: number, error: unknown) =>
  [
    `Drawing ${count} of the docs' diagrams needs Chromium, which did not start:`,
    `  ${String(error instanceof Error ? error.message : error).split("\n")[0]}`,
    "Install it once with `npm run browsers` (on Linux, if it lacks system libraries:",
    "`sudo npx playwright install-deps chromium`).",
  ].join("\n");

/**
 * Each diagram's light and dark drawing, by its hash. A drawing in the
 * cache is used when it passes checkSvg (the cache folder is anyone's
 * to write); the rest are drawn in one browser, a page per theme, each
 * with the font embedded and its notice, checked, and written to the
 * cache under a temporary name, then renamed into place, so a build
 * drawing at the same time never reads half a file. A diagram Mermaid
 * refuses fails it all with a DiagramError at the page's line.
 *
 * When Chromium does not start, `required` throws, naming the command
 * that installs it; `optional` warns and returns null: no drawings.
 * `skip` returns null at once, with a warning, reading no cache and
 * starting no browser.
 */
export async function drawDiagrams(
  diagrams: readonly Diagram[],
  options: {
    inputs: DrawInputs;
    cacheDir: string;
    mode?: DrawMode;
    launch?: Launch;
    warn?: (message: string) => void;
  },
): Promise<Map<string, Drawing> | null> {
  const { inputs, cacheDir, mode = "required" } = options;
  const warn = options.warn ?? console.warn;
  if (mode === "skip") {
    warn("DOCS_DIAGRAMS=skip: the docs are built without their diagrams.");
    return null;
  }
  const unique = [...new Map(diagrams.map((diagram) => [diagram.hash, diagram])).values()];
  const drawn = new Map<string, Partial<Drawing>>();
  const missing: { diagram: Diagram; theme: Theme }[] = [];
  for (const diagram of unique) {
    drawn.set(diagram.hash, {});
    for (const theme of THEMES) {
      const cached = await readFile(join(cacheDir, `${diagram.keys[theme]}.svg`), "utf8").catch(
        () => null,
      );
      if (cached !== null && checkSvg(cached) === null) drawn.get(diagram.hash)![theme] = cached;
      else missing.push({ diagram, theme });
    }
  }
  if (missing.length > 0) {
    let browser: DrawingBrowser;
    try {
      browser = await (options.launch ?? launchChromium)();
    } catch (error) {
      const message = launchFailed(missing.length, error);
      if (mode === "required") throw new Error(message, { cause: error });
      warn(`${message}\nThe docs are shown without their diagrams.`);
      return null;
    }
    const notice = fontNotice(inputs.license);
    const problems = new Map<string, DiagramProblem>();
    try {
      await mkdir(cacheDir, { recursive: true });
      await Promise.all(
        THEMES.map(async (theme) => {
          const jobs = missing.filter((job) => job.theme === theme);
          if (jobs.length === 0) return;
          const page = await browser.newPage();
          await page.setContent("<!doctype html><html><body></body></html>");
          await page.addStyleTag({ content: fontFace(inputs.font) });
          await page.evaluate(loadFont, FONT_FAMILY);
          await page.addScriptTag({ path: MERMAID_JS });
          const rendered = await page.evaluate(renderAll, {
            config: diagramTheme(theme),
            jobs: jobs.map(({ diagram }) => ({
              id: `diagram-${diagram.hash.slice(0, 8)}`,
              source: diagram.source,
            })),
          });
          await page.close();
          for (const [index, result] of rendered.entries()) {
            const { diagram } = jobs[index]!;
            if ("error" in result) {
              problems.set(diagram.hash, mermaidError(result.error, diagram));
              continue;
            }
            const svg = embedFont(result.svg, inputs.font, notice);
            const refused = checkSvg(svg);
            if (refused !== null) {
              problems.set(diagram.hash, {
                file: diagram.file,
                line: diagram.line,
                what: `Mermaid's drawing ${refused}`,
              });
              continue;
            }
            const file = join(cacheDir, `${diagram.keys[theme]}.svg`);
            const temporary = `${file}.${randomUUID()}.tmp`;
            await writeFile(temporary, svg);
            await rename(temporary, file);
            drawn.get(diagram.hash)![theme] = svg;
          }
        }),
      );
    } finally {
      await browser.close();
    }
    if (problems.size > 0) throw new DiagramError([...problems.values()]);
  }
  return drawn as Map<string, Drawing>;
}
