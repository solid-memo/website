// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { beat, heartbeats, type Stalls } from "./heartbeat.ts";

const T0 = Date.parse("2026-11-03T21:00:00.000Z");
const at = (seconds: number) => T0 + seconds * 1_000;
const iso = (seconds: number) => new Date(at(seconds)).toISOString();

/** Beats of `page` each second from `from` to `to`, its frames as `frames` gives them. */
function beats(
  pulse: ReturnType<typeof heartbeats>,
  page: string,
  from: number,
  to: number,
  frames: (second: number) => number,
) {
  for (let second = from; second <= to; second++) pulse.beat(page, frames(second), at(second));
}

describe("heartbeats", () => {
  const fresh = (): Stalls => ({ silences: [], stills: [] });

  it("notes nothing of a page that beats and draws", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 30, (second) => second);
    pulse.end(at(30.5));
    expect(found).toEqual(fresh());
  });

  it("notes a silence, and when it ended", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 2, (second) => second);
    beats(pulse, "page", 12, 14, (second) => second);
    pulse.end(at(14.5));
    expect(found.silences).toEqual([{ page: "page", from: iso(2), to: iso(12), seconds: 10 }]);
    expect(found.stills).toEqual([]);
  });

  it("notes a silence the page never came back from", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 2, (second) => second);
    pulse.end(at(30));
    expect(found.silences).toEqual([{ page: "page", from: iso(2), to: null, seconds: 28 }]);
  });

  it("notes a still: beats, but no frame drawn", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 20, (second) => Math.min(second, 4));
    beats(pulse, "page", 21, 22, (second) => second);
    pulse.end(at(22.5));
    expect(found.stills).toEqual([{ page: "page", from: iso(4), to: iso(21), seconds: 17 }]);
    expect(found.silences).toEqual([]);
  });

  it("notes a still the page never drew again after", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 20, () => 3);
    pulse.end(at(20.5));
    expect(found.stills).toEqual([{ page: "page", from: iso(0), to: null, seconds: 20.5 }]);
  });

  it("ends a still where a silence begins, and starts afresh after it", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 8, () => 1);
    beats(pulse, "page", 20, 22, () => 1);
    pulse.end(at(22.5));
    expect(found.silences).toEqual([{ page: "page", from: iso(8), to: iso(20), seconds: 12 }]);
    expect(found.stills).toEqual([{ page: "page", from: iso(0), to: iso(8), seconds: 8 }]);
  });

  it("notes a page that went quiet for good as silent, not still", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 3, () => 1);
    pulse.end(at(30));
    expect(found.silences).toEqual([{ page: "page", from: iso(3), to: null, seconds: 27 }]);
    expect(found.stills).toEqual([]);
  });

  it("takes a page loaded anew, its count from 0 again, as drawing", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 4, (second) => second);
    beats(pulse, "page", 5, 9, (second) => second - 5);
    pulse.end(at(9.5));
    expect(found).toEqual(fresh());
  });

  it("stops a page at its close, and forgets it", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "device 1", 0, 2, (second) => second);
    pulse.close("device 1", at(10));
    pulse.close("device 1", at(11));
    pulse.end(at(60));
    expect(found.silences).toEqual([{ page: "device 1", from: iso(2), to: null, seconds: 8 }]);
  });

  it("keeps each page's pulse apart", () => {
    const found = fresh();
    const pulse = heartbeats(found);
    beats(pulse, "page", 0, 20, (second) => second);
    beats(pulse, "device 1", 0, 3, (second) => second);
    pulse.end(at(20.5));
    expect(found.silences.map((silence) => silence.page)).toEqual(["device 1"]);
  });
});

describe("beat", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A top-level window with `binding`, and requestAnimationFrame that draws when `draw()` is called. */
  function page(binding: (frames: number) => Promise<void>, top = true) {
    const pending: (() => void)[] = [];
    const window: Record<string, unknown> = { __beat: binding };
    window.top = top ? window : {};
    vi.stubGlobal("window", window);
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => pending.push(callback));
    return { draw: () => pending.splice(0).forEach((callback) => callback()) };
  }

  it("sends how many frames were drawn, each second", async () => {
    vi.useFakeTimers();
    const sent: number[] = [];
    const { draw } = page(async (frames) => void sent.push(frames));
    beat("__beat");
    await vi.advanceTimersByTimeAsync(1_000);
    draw();
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sent).toEqual([0, 1, 1]);
  });

  it("lets a beat the page left go unanswered", async () => {
    vi.useFakeTimers();
    const binding = vi.fn(() => Promise.reject(new Error("The page has left.")));
    page(binding);
    beat("__beat");
    await vi.advanceTimersByTimeAsync(2_000);
    expect(binding).toHaveBeenCalledTimes(2);
  });

  it("beats in the top frame alone", async () => {
    vi.useFakeTimers();
    const binding = vi.fn(async () => undefined);
    page(binding, false);
    beat("__beat");
    await vi.advanceTimersByTimeAsync(3_000);
    expect(binding).not.toHaveBeenCalled();
  });

  it("refers to nothing outside itself, as a script added to a page must", async () => {
    vi.useFakeTimers();
    const binding = vi.fn(async () => undefined);
    page(binding);
    new Function(`(${beat.toString()})("__beat");`)();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(binding).toHaveBeenCalledWith(0);
  });
});
