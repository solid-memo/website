// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { paletteBlocks } from "@solid-memo/domain/testing/contrast";

/*
 * The browser's chrome before the app runs: the theme-color meta tags,
 * written out in the pages, in Standard's background (palettes.css),
 * light and dark. The app sets them from the palette shown once it runs
 * (ui/theme.tsx).
 */

const app = resolve(import.meta.dirname, "..");
const palettes = readFileSync(
  join(dirname(createRequire(import.meta.url).resolve("@solid-memo/ui/style.css")), "palettes.css"),
  "utf8",
);
const [light, dark] = paletteBlocks(palettes);

describe.each(["index.html", "public/about/index.html"])("%s", (page) => {
  it("colors the browser's chrome in Standard's background, light and dark", () => {
    const html = readFileSync(resolve(app, page), "utf8");
    const metas = [
      ...html.matchAll(/<meta name="theme-color" content="([^"]*)" media="([^"]*)" \/>/g),
    ].map(([, content, media]) => [media, content]);
    expect(metas).toEqual([
      ["(prefers-color-scheme: light)", light!.roles["--bg"]],
      ["(prefers-color-scheme: dark)", dark!.roles["--bg"]],
    ]);
  });
});
