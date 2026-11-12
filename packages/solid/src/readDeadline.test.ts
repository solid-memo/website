// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limitedFetch } from "./client/readLimits";
import { getSolidDatasetLinear } from "./client/resources";
import { READ_DEADLINE_MS, withReadDeadline } from "./readDeadline";

/** A server that never answers: its request settles only when aborted, as a browser's does. */
const silent = vi.fn(
  (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
);

/** A body that starts with a triple, then sends a space every `every` milliseconds: `parts` of them, or with no end. */
function dripping(every: number, parts = Number.POSITIVE_INFINITY): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    async pull(controller) {
      if (sent === 0) controller.enqueue(new TextEncoder().encode("<a> <b> <c> ."));
      else await new Promise((resolve) => setTimeout(resolve, every));
      if (sent > parts) return controller.close();
      if (sent++ > 0) controller.enqueue(new TextEncoder().encode(" "));
    },
  });
}

/**
 * The text of the response's body, read from its stream: a body that
 * fails gives the reason its stream failed with, where a browser's
 * `text()` gives an error of its own.
 */
async function bodyOf(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (let next = await reader.read(); !next.done; next = await reader.read())
    text += decoder.decode(next.value, { stream: true });
  return text;
}

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

  it("lets an answer through, its body read whenever the reader is ready", async () => {
    const answer = new Response("<> a <#Deck> .", { headers: { "Content-Type": "text/turtle" } });
    Object.defineProperty(answer, "url", { value: "https://pod.example/a.ttl" });
    Object.defineProperty(answer, "redirected", { value: true });
    const fetch = withReadDeadline(async () => answer, 50, 1000);
    const response = await fetch("https://pod.example/a.ttl");
    await vi.advanceTimersByTimeAsync(100);
    expect(await response.text()).toBe("<> a <#Deck> .");
    expect(response).toMatchObject({ status: 200, url: answer.url, redirected: true });
    expect(response.headers.get("Content-Type")).toBe("text/turtle");
    // Read in full, it has no deadline left to pass.
    await vi.advanceTimersByTimeAsync(2000);
  });

  it("lets a body through as long as it keeps coming, within the whole read's deadline", async () => {
    const fetch = withReadDeadline(async () => new Response(dripping(40, 5)), 50, 1000);
    const read = bodyOf(await fetch("https://pod.example/a.ttl"));
    await vi.advanceTimersByTimeAsync(400);
    expect(await read).toBe(`<a> <b> <c> .${" ".repeat(5)}`);
  });

  it("lets a body take as long in all as it keeps coming when no whole read's deadline is given, as for the user's own pod", async () => {
    const fetch = withReadDeadline(async () => new Response(dripping(40, 60)), 50);
    const read = bodyOf(await fetch("https://pod.example/a.ttl"));
    await vi.advanceTimersByTimeAsync(3000);
    expect(await read).toBe(`<a> <b> <c> .${" ".repeat(60)}`);
  });

  it("gives up on a body that keeps coming slowly, once the whole read's deadline passes", async () => {
    const fetch = withReadDeadline(async () => new Response(dripping(40)), 50, 1000);
    const read = bodyOf(await fetch("https://pod.example/a.ttl"));
    const failed = expect(read).rejects.toMatchObject({
      code: "podNoAnswer",
      vars: { url: "https://pod.example/a.ttl", seconds: 1 },
    });
    await vi.advanceTimersByTimeAsync(1000);
    await failed;
  });

  it("gives up on a body that stops coming, and lets the server's go", async () => {
    const source = { cancelled: undefined as unknown };
    const fetch = withReadDeadline(
      async () =>
        new Response(
          new ReadableStream({
            start: (controller) => controller.enqueue(new TextEncoder().encode("<a> <b> ")),
            cancel: (reason) => {
              source.cancelled = reason;
              throw new Error("already gone");
            },
          }),
        ),
      50,
      1000,
    );
    const read = bodyOf(await fetch("https://pod.example/a.ttl"));
    const failed = expect(read).rejects.toMatchObject({
      code: "podNoAnswer",
      vars: { seconds: 0.05 },
    });
    await vi.advanceTimersByTimeAsync(50);
    await failed;
    expect(source.cancelled).toMatchObject({ code: "podNoAnswer" });
    // Given up on, it has no deadline left to pass.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fails a body the server ends on the abort with podNoAnswer, not the abort", async () => {
    const fetch = withReadDeadline(
      async (_input, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init?.signal?.addEventListener("abort", () =>
                controller.error(new DOMException("aborted", "AbortError")),
              );
            },
          }),
        ),
      50,
      1000,
    );
    const read = bodyOf(await fetch("https://pod.example/a.ttl"));
    const failed = expect(read).rejects.toMatchObject({ code: "podNoAnswer" });
    await vi.advanceTimersByTimeAsync(50);
    await failed;
  });

  it("gives up on a body the reader never takes, once the whole read's deadline passes", async () => {
    let cancelled = false;
    const fetch = withReadDeadline(
      async () =>
        new Response(
          new ReadableStream({
            start: (controller) => controller.enqueue(new TextEncoder().encode("<a> <b> ")),
            cancel: () => void (cancelled = true),
          }),
        ),
      50,
      1000,
    );
    const response = await fetch("https://pod.example/a.ttl");
    await vi.advanceTimersByTimeAsync(999);
    expect(cancelled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(cancelled).toBe(true);
    await expect(bodyOf(response)).rejects.toMatchObject({
      code: "podNoAnswer",
      vars: { seconds: 1 },
    });
  });

  it("passes on a body's own failure, and the reader's cancel, as they are", async () => {
    const broken = withReadDeadline(
      async () =>
        new Response(
          new ReadableStream({
            pull: (controller) => controller.error(new TypeError("connection reset")),
          }),
        ),
      50,
    );
    await expect(bodyOf(await broken("https://pod.example/a.ttl"))).rejects.toThrow(
      "connection reset",
    );

    let cancelled: unknown;
    const fetch = withReadDeadline(
      async () =>
        new Response(new ReadableStream({ cancel: (reason) => void (cancelled = reason) })),
      50,
      1000,
    );
    const response = await fetch("https://pod.example/a.ttl");
    await response.body!.cancel("enough");
    expect(cancelled).toBe("enough");
    // Let go, it has no deadline left to pass.
    await vi.advanceTimersByTimeAsync(2000);
  });

  it("ends a document's read whose body drips or stops, under read limits or none, with podNoAnswer", async () => {
    const turtle = (body: ReadableStream<Uint8Array>) => async () =>
      new Response(body, { headers: { "Content-Type": "text/turtle" } });
    const limits = { bytes: 1 << 20, quads: 100, characters: 1 << 20 };
    const reads = [
      withReadDeadline(turtle(dripping(40)), 50, 1000),
      limitedFetch(withReadDeadline(turtle(dripping(40)), 50, 1000), limits),
      withReadDeadline(
        turtle(
          new Blob(["<a> <b> "])
            .stream()
            .pipeThrough(new TransformStream({ flush: () => new Promise(() => {}) })),
        ),
        50,
        1000,
      ),
    ].map((fetch) => getSolidDatasetLinear("https://pod.example/a.ttl", { fetch }));
    const failed = Promise.allSettled(reads);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await failed).map((read) => read.status === "rejected" && read.reason)).toEqual([
      expect.objectContaining({
        code: "podNoAnswer",
        vars: expect.objectContaining({ seconds: 1 }),
      }),
      expect.objectContaining({
        code: "podNoAnswer",
        vars: expect.objectContaining({ seconds: 1 }),
      }),
      expect.objectContaining({
        code: "podNoAnswer",
        vars: expect.objectContaining({ seconds: 0.05 }),
      }),
    ]);
  });

  it("gives an answer with no body as it is", async () => {
    const empty = new Response(null, { status: 204 });
    expect(await withReadDeadline(async () => empty, 50)("https://pod.example/a.ttl")).toBe(empty);
    // A browser can answer a conditional read with a 304 whose body is an empty stream.
    const notModified = new Response("");
    Object.defineProperty(notModified, "status", { value: 304 });
    const fetch = withReadDeadline(async () => notModified, 50);
    expect(await fetch("https://pod.example/a.ttl")).toBe(notModified);
    await vi.advanceTimersByTimeAsync(2000);
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
