// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/preact";
import { useStopwatch } from "./stopwatch";

let clock = 0;

function showPage(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  clock = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  showPage("visible");
  vi.restoreAllMocks();
});

describe("useStopwatch", () => {
  it("counts from the screen coming up, and from naught again once restarted", () => {
    const { result } = renderHook(() => useStopwatch());
    clock += 2_500;
    expect(result.current.read()).toBe(2_500);
    result.current.restart();
    clock += 700;
    expect(result.current.read()).toBe(700);
  });

  it("leaves out the time the page was hidden, however often it says so", () => {
    const { result } = renderHook(() => useStopwatch());
    clock += 1_000;
    showPage("hidden");
    clock += 60_000;
    showPage("hidden");
    expect(result.current.read()).toBe(1_000);
    clock += 60_000;
    showPage("visible");
    clock += 500;
    showPage("visible");
    clock += 500;
    expect(result.current.read()).toBe(2_000);
  });

  it("starts counting once the page shows, when it came up hidden or was restarted hidden", () => {
    showPage("hidden");
    const { result } = renderHook(() => useStopwatch());
    clock += 30_000;
    showPage("visible");
    clock += 400;
    expect(result.current.read()).toBe(400);
    showPage("hidden");
    result.current.restart();
    clock += 30_000;
    showPage("visible");
    clock += 300;
    expect(result.current.read()).toBe(300);
  });

  it("stops listening once the screen goes away", () => {
    const { result, unmount } = renderHook(() => useStopwatch());
    const watch = result.current;
    unmount();
    clock += 1_000;
    showPage("hidden");
    clock += 1_000;
    // Still counting: the page hidden after the screen went away is not heard.
    expect(watch.read()).toBe(2_000);
  });
});
