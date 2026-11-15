// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import { breakable, MAX_BREAKS } from "./breakable";

function shown(text: string): HTMLElement {
  return render(<p>{breakable(text)}</p>).container.querySelector("p")!;
}

/** The nodes under an element, itself left out. */
function nodeCount(element: Node): number {
  let count = 0;
  const walker = document.createTreeWalker(element);
  while (walker.nextNode()) count++;
  return count;
}

describe("breakable", () => {
  it("lets a line break after each slash, keeping the text as it is", () => {
    const p = shown("Fastighetstekniker/Drifttekniker, fastighet");
    expect(p.innerHTML).toBe("Fastighetstekniker/<wbr>Drifttekniker, fastighet");
    expect(p).toHaveTextContent("Fastighetstekniker/Drifttekniker, fastighet");
  });

  it("breaks a path or an address after each slash between two of its parts", () => {
    expect(shown("https://example.org/a/b/").innerHTML).toBe("https://example.org/<wbr>a/<wbr>b/");
    expect(shown("and/or, and / or, a//b, /a").innerHTML).toBe("and/<wbr>or, and / or, a//b, /a");
  });

  it("leaves text without a slash to break after alone", () => {
    expect(breakable("Drifttekniker")).toBe("Drifttekniker");
    expect(breakable("a / b // c/")).toBe("a / b // c/");
  });

  it("gives a text at most MAX_BREAKS breaks, the rest one string", () => {
    const text = "a/".repeat(8000);
    const p = shown(text);
    expect(p.querySelectorAll("wbr")).toHaveLength(MAX_BREAKS);
    expect(nodeCount(p)).toBe(2 * MAX_BREAKS + 1);
    expect(p.textContent).toBe(text);
  });

  it("renders a run of slashes as one string", () => {
    const text = "/".repeat(16000);
    expect(breakable(text)).toBe(text);
  });
});
