// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/preact";
import type { PodWait } from "@solid-memo/application/podWaits";
import { makePodWaitUseCasesFake } from "../test/fakes/podWaits";
import { PodWaitStatus } from "./PodWaitStatus";

/** The use cases of waits the test sets, telling the listeners each time it does. */
function podWaits(waits: PodWait[] = []) {
  const listeners = new Set<() => void>();
  let current = waits;
  const useCases = makePodWaitUseCasesFake({
    podWaits: vi.fn(() => current),
    watchPodWaits: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  });
  const set = (next: PodWait[]) =>
    act(() => {
      current = next;
      for (const listener of listeners) listener();
    });
  return { useCases, set, listeners };
}

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000);

/** What the screen shows, and what a screen reader is told. */
function shown() {
  const status = screen.getByRole("status");
  return {
    seen: [...status.querySelectorAll('[aria-hidden="true"]')].map((line) => line.textContent),
    heard: [...status.querySelectorAll(".visually-hidden")].map((line) => line.textContent),
  };
}

describe("PodWaitStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is an empty polite status while no server asked for a wait", () => {
    render(<PodWaitStatus useCases={podWaits().useCases} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("says a server asked to slow down, counting down each second, and tells a screen reader once", async () => {
    const { useCases } = podWaits([{ host: "pod.example", until: inSeconds(40), asked: true }]);
    render(<PodWaitStatus useCases={useCases} />);
    expect(shown()).toEqual({
      seen: ["The server pod.example asked Solid Memo to slow down. Trying again in 40 s."],
      heard: ["The server pod.example asked Solid Memo to slow down. Trying again in 40 s."],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(shown()).toEqual({
      seen: ["The server pod.example asked Solid Memo to slow down. Trying again in 25 s."],
      heard: ["The server pod.example asked Solid Memo to slow down. Trying again in 40 s."],
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    // Its wait over, nothing is counted any more.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says a server that failed many requests with no status isn't answering", () => {
    const { useCases } = podWaits([{ host: "pod.example", until: inSeconds(1.5), asked: false }]);
    render(<PodWaitStatus useCases={useCases} />);
    expect(shown().seen).toEqual([
      "The server pod.example isn't answering for now. Trying again in 2 s.",
    ]);
  });

  it("tells of each wait as it starts or grows, a line per server, and listens no more once gone", async () => {
    const { useCases, set, listeners } = podWaits();
    const { unmount } = render(<PodWaitStatus useCases={useCases} />);
    await set([{ host: "pod.example", until: inSeconds(10), asked: true }]);
    await set([
      { host: "pod.example", until: inSeconds(30), asked: true },
      { host: "decks.example.org", until: inSeconds(60), asked: true },
    ]);
    expect(shown().heard).toEqual([
      "The server pod.example asked Solid Memo to slow down. Trying again in 30 s.",
      "The server decks.example.org asked Solid Memo to slow down. Trying again in 60 s.",
    ]);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(listeners.size).toBe(0);
  });
});
