// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READ_DEADLINE_MS, withReadDeadline } from "./readDeadline";

/** A server that never answers: its request settles only when aborted, as a browser's does. */
const silent = vi.fn(
  (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
);

describe("withReadDeadline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    silent.mockClear();
  });

  it("gives up on a read the server does not start to answer in time", async () => {
    const read = withReadDeadline(silent)("https://pod.example/a.ttl");
    const failed = expect(read).rejects.toThrow(AppError);
    await vi.advanceTimersByTimeAsync(READ_DEADLINE_MS);
    await failed;
    await expect(read).rejects.toMatchObject({
      code: "podNoAnswer",
      vars: { url: "https://pod.example/a.ttl", seconds: READ_DEADLINE_MS / 1000 },
    });
  });

  it("waits for a HEAD or OPTIONS, and a Request's own method, as for a GET", async () => {
    const fetch = withReadDeadline(silent, 50);
    const reads = [
      fetch("https://pod.example/", { method: "head" }),
      fetch("https://pod.example/", { method: "OPTIONS" }),
      fetch(new Request("https://pod.example/b.ttl", { method: "HEAD" })),
    ];
    const failed = Promise.allSettled(reads);
    await vi.advanceTimersByTimeAsync(50);
    for (const read of await failed) {
      expect(read).toMatchObject({ status: "rejected", reason: { code: "podNoAnswer" } });
    }
    expect((await failed)[2]).toMatchObject({
      reason: { vars: { url: "https://pod.example/b.ttl" } },
    });
  });

  it("lets an answer through, and its body take as long as it needs", async () => {
    const answer = new Response("<> a <#Deck> .");
    const fetch = withReadDeadline(async () => answer, 50);
    const response = await fetch("https://pod.example/a.ttl");
    await vi.advanceTimersByTimeAsync(100);
    expect(await response.text()).toBe("<> a <#Deck> .");
  });

  it("sets no deadline on a write", async () => {
    const write = withReadDeadline(silent, 50)("https://pod.example/a.ttl", { method: "PUT" });
    let settled = false;
    void write.catch(() => undefined).finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false);
    expect(silent.mock.calls[0]?.[1]).toEqual({ method: "PUT" });
  });

  it("passes on the caller's abort as it is, and other failures too", async () => {
    const caller = new AbortController();
    const read = withReadDeadline(silent, 50)("https://pod.example/a.ttl", {
      signal: caller.signal,
    });
    const failed = expect(read).rejects.toBe("stopped");
    caller.abort("stopped");
    await failed;

    const own = new AbortController();
    const fromRequest = withReadDeadline(
      silent,
      50,
    )(new Request("https://pod.example/a.ttl", { signal: own.signal }));
    const failedToo = expect(fromRequest).rejects.toBeInstanceOf(DOMException);
    own.abort();
    await failedToo;

    const offline = withReadDeadline(async () => {
      throw new TypeError("Failed to fetch");
    }, 50);
    await expect(offline("https://pod.example/a.ttl")).rejects.toThrow(TypeError);
  });
});
