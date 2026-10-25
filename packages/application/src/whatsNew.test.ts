// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { SeenHighlights } from "./ports";
import { createUseCases } from "./useCases";
import { makeDeps } from "./testing/fakePorts";

function seenHighlights(kept: string[] | null): SeenHighlights {
  return { seen: vi.fn(() => kept), see: vi.fn() };
}

function useCasesWith(port: SeenHighlights) {
  return createUseCases({ ...makeDeps(), seenHighlights: port });
}

describe("what's new", () => {
  it("spares a first visit every highlight, keeping them as seen", () => {
    const port = seenHighlights(null);
    expect(useCasesWith(port).unseenHighlights(["b", "a"])).toEqual([]);
    expect(port.see).toHaveBeenCalledWith(["b", "a"]);
  });

  it("gives the highlights not seen, in the order given, ignoring ids no longer listed", () => {
    const port = seenHighlights(["a", "gone"]);
    expect(useCasesWith(port).unseenHighlights(["c", "b", "a"])).toEqual(["c", "b"]);
    expect(port.see).not.toHaveBeenCalled();
  });

  it("gives none once every highlight is seen", () => {
    const port = seenHighlights(["b", "a"]);
    expect(useCasesWith(port).unseenHighlights(["b", "a"])).toEqual([]);
    expect(port.see).not.toHaveBeenCalled();
  });

  it("keeps the highlights dismissed as seen, beside those already kept", () => {
    const port = seenHighlights(["a"]);
    useCasesWith(port).dismissHighlights(["b", "a"]);
    expect(port.see).toHaveBeenCalledWith(["a", "b"]);
  });

  it("keeps as seen what a newer version dismissed when an older one dismisses fewer", () => {
    let kept: string[] | null = ["b", "a"];
    const port: SeenHighlights = { seen: () => kept, see: (ids) => (kept = [...ids]) };
    const useCases = useCasesWith(port);
    useCases.dismissHighlights(["a"]);
    expect(useCases.unseenHighlights(["b", "a"])).toEqual([]);
  });

  it("keeps the highlights dismissed when none were kept", () => {
    const port = seenHighlights(null);
    useCasesWith(port).dismissHighlights(["a"]);
    expect(port.see).toHaveBeenCalledWith(["a"]);
  });
});
