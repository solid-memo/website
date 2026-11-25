// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { DeviceValue } from "./ports/device";
import { createUseCases } from "./useCases";
import { choicesStore, makeDeps } from "./testing/fakePorts";

function seenHighlights(kept: string[] | null): DeviceValue<string[] | null> {
  return { read: vi.fn(() => kept), write: vi.fn() };
}

function useCasesWith(port: DeviceValue<string[] | null>) {
  return createUseCases({ ...makeDeps(), deviceStore: choicesStore({ seenHighlights: port }) });
}

describe("what's new", () => {
  it("spares a first visit every highlight, keeping them as seen", () => {
    const port = seenHighlights(null);
    expect(useCasesWith(port).unseenHighlights(["b", "a"])).toEqual([]);
    expect(port.write).toHaveBeenCalledWith(["b", "a"]);
  });

  it("gives the highlights not seen, in the order given, ignoring ids no longer listed", () => {
    const port = seenHighlights(["a", "gone"]);
    expect(useCasesWith(port).unseenHighlights(["c", "b", "a"])).toEqual(["c", "b"]);
    expect(port.write).not.toHaveBeenCalled();
  });

  it("gives none once every highlight is seen", () => {
    const port = seenHighlights(["b", "a"]);
    expect(useCasesWith(port).unseenHighlights(["b", "a"])).toEqual([]);
    expect(port.write).not.toHaveBeenCalled();
  });

  it("keeps the highlights dismissed as seen, beside those already kept", () => {
    const port = seenHighlights(["a"]);
    useCasesWith(port).dismissHighlights(["b", "a"]);
    expect(port.write).toHaveBeenCalledWith(["a", "b"]);
  });

  it("keeps as seen what a newer version dismissed when an older one dismisses fewer", () => {
    let kept: string[] | null = ["b", "a"];
    const port: DeviceValue<string[] | null> = {
      read: () => kept,
      write: (ids) => (kept = ids === null ? null : [...ids]),
    };
    const useCases = useCasesWith(port);
    useCases.dismissHighlights(["a"]);
    expect(useCases.unseenHighlights(["b", "a"])).toEqual([]);
  });

  it("keeps the highlights dismissed when none were kept", () => {
    const port = seenHighlights(null);
    useCasesWith(port).dismissHighlights(["a"]);
    expect(port.write).toHaveBeenCalledWith(["a"]);
  });
});
