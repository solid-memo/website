// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { growth } from "@solid-memo/domain/testing/growth";
import { turtleFetch } from "@solid-memo/shacl/testing/turtle";
import { describe, expect, it } from "vitest";
import { getSolidDataset } from "../client/resources";
import { SM_NS } from "../vocab";
import { withPalette } from "./paletteMapper";

const DOCUMENT = "https://pod.example/solid-memo/main/palettes.ttl";
const P = `${DOCUMENT}#p`;
const MINE: CustomPalette = {
  url: P,
  title: { en: "Mine" },
  basedOn: "standard",
  light: { "--bg": "#445566" },
  dark: { "--text": "#eeeeee" },
};

/** `<#p>` and another palette that names `<#p-light>`, `-light-2`, … `-light-<count>`, and the same for dark. */
function document(count: number) {
  const named = (theme: string) =>
    Array.from({ length: count }, (_, i) => `<#p-${theme}${i === 0 ? "" : `-${i + 1}`}>`).join(
      ", ",
    );
  return getSolidDataset(DOCUMENT, {
    fetch: turtleFetch(`@prefix sm: <${SM_NS}> .
<#p> a sm:Palette .
<#q> a sm:Palette ; sm:lightColors ${named("light")} ; sm:darkColors ${named("dark")} .
`),
  });
}

describe("withPalette", () => {
  it("finds its color sets past many that another palette names in time that grows with them, not with their square", async () => {
    const size = 1000;
    const times = 8;
    const datasets = new Map([
      [size, await document(size)],
      [size * times, await document(size * times)],
    ]);
    const ratio = growth(
      (count) => {
        const dataset = datasets.get(count)!;
        expect(withPalette(dataset, DOCUMENT, MINE).subjects).toEqual([
          P,
          `${P}-light-${count + 1}`,
          `${P}-dark-${count + 1}`,
        ]);
        return () => withPalette(dataset, DOCUMENT, MINE);
      },
      size,
      times,
    );
    expect(ratio).toBeLessThan(4);
  });
});
