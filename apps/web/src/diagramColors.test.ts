// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { paletteBlocks } from "@solid-memo/domain/testing/contrast";
import { DIAGRAM_ROLES } from "@solid-memo/build-tools/diagrams";

/**
 * The docs' diagrams are drawn in Standard's colors (diagramTheme in
 * @solid-memo/build-tools), which the site's build can't read from
 * palettes.css, so they are written out there: each as palettes.css has
 * it, light and dark.
 */

const palettes = readFileSync(
  join(dirname(createRequire(import.meta.url).resolve("@solid-memo/ui/style.css")), "palettes.css"),
  "utf8",
);
const [light, dark] = paletteBlocks(palettes);

describe("the docs' diagrams", () => {
  it.each([
    ["light", light!, DIAGRAM_ROLES.light],
    ["dark", dark!, DIAGRAM_ROLES.dark],
  ] as const)("are drawn in Standard's %s colors", (_, block, roles) => {
    for (const [role, color] of Object.entries(roles))
      expect([role, block.roles[role]]).toEqual([role, color]);
  });
});
