// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { createPodWaitUseCases } from "./podWaits";

describe("createPodWaitUseCases", () => {
  it("gives the waits the port keeps, and tells a listener of each change until it stops", () => {
    const wait = { host: "pod.example", until: new Date("2026-11-28T12:00:40Z"), asked: true };
    const stop = vi.fn();
    const podWaits = { current: vi.fn(() => [wait]), listen: vi.fn(() => stop) };
    const useCases = createPodWaitUseCases({ podWaits });
    expect(useCases.podWaits()).toEqual([wait]);
    const listener = vi.fn();
    expect(useCases.watchPodWaits(listener)).toBe(stop);
    expect(podWaits.listen).toHaveBeenCalledWith(listener);
  });
});
