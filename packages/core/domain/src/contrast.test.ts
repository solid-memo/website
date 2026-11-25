// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { contrast, hexColor, hexOf, mix, over } from "./contrast";

describe("colors", () => {
  it("are read from #rrggbb or #rrggbbaa, in either case, and nothing else", () => {
    expect(hexColor("#FFffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(hexColor("#00000080")).toEqual({ r: 0, g: 0, b: 0, a: 128 / 255 });
    for (const text of ["#fff", "red", "var(--text)", "#ffffff;", "url(#x)", ""])
      expect(hexColor(text), text).toBeNull();
  });

  it("are written #rrggbb in lower case, each channel rounded", () => {
    expect(hexOf({ r: 127.5, g: 0, b: 254.6, a: 1 })).toBe("#8000ff");
  });

  it("mix as color-mix(in srgb) does: premultiplied, the percentages normalized", () => {
    const [white, black] = [hexColor("#ffffff")!, hexColor("#000000")!];
    expect(mix(white, 50, black, 50)).toEqual({ r: 127.5, g: 127.5, b: 127.5, a: 1 });
    expect(mix(white, 60, black, 60)).toEqual(mix(white, 50, black, 50));
    // Below 100% in all, the mix is the more transparent.
    expect(mix(white, 30, hexColor("#00000000")!, 0).a).toBeCloseTo(0.3);
    expect(mix(hexColor("#00000000")!, 50, hexColor("#ffffff00")!, 50)).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });

  it("lay a see-through color over an opaque one", () => {
    expect(over(hexColor("#ffffff80")!, hexColor("#000000")!).r).toBeCloseTo(128);
  });

  it("measure WCAG 2's contrast ratio, a see-through text laid over its surface first", () => {
    const [white, black] = [hexColor("#ffffff")!, hexColor("#000000")!];
    expect(contrast(black, white)).toBe(21);
    expect(contrast(white, black)).toBe(21);
    expect(contrast(white, white)).toBe(1);
    expect(contrast(hexColor("#00000000")!, white)).toBe(1);
    expect(() => contrast(black, hexColor("#ffffff80")!)).toThrow("lay it over");
  });
});
