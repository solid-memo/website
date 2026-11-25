// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { exclusively } from "./oidcSession";

// The session's fetch and refresh are tested through the sign-in client (session.test.ts).
describe("exclusively", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "locks");
  });

  it("runs a write of the stored session under the browser's Web Lock, where it has one", async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
    await expect(exclusively(async () => "written")).resolves.toBe("written");
    expect(request).toHaveBeenCalledWith("solid-memo:oidc-session", expect.any(Function));
  });

  it("runs writes one after another without Web Locks, past one that failed", async () => {
    expect(navigator.locks).toBeFalsy();
    const order: string[] = [];
    let release: (() => void) | undefined;
    const first = exclusively(
      () =>
        new Promise<never>((_, reject) => {
          release = () => {
            order.push("first");
            reject(new Error("refused"));
          };
        }),
    );
    const second = exclusively(async () => {
      order.push("second");
    });
    await vi.waitFor(() => expect(release).toBeDefined());
    expect(order).toEqual([]);
    release!();
    await expect(first).rejects.toThrow("refused");
    await second;
    expect(order).toEqual(["first", "second"]);
  });
});
