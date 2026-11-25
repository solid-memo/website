// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { ReadLimitError } from "@solid-memo/solid-client/interface";
import {
  isPastBudget,
  limitedFetch,
  noneSpent,
  sharedReadBudget,
} from "@solid-memo/solid-client/readLimits";
import { createOffPage, type WorkerLike } from "./offPage";
import type { PageMessage, WorkerMessage } from "./offPageProtocol";

const CONFIG = { shapesBaseUrl: "s/", vocabBaseUrl: "v/", vendorBaseUrl: "x/" };
const DOC = "https://bob.example/doc.ttl";

/** A worker the test plays: what the page sends it, and what it says or does back. */
function fakeWorker() {
  const listeners = new Map<string, ((event: MessageEvent & Event) => void)[]>();
  const posted: PageMessage[] = [];
  let heard: (() => void) | undefined;
  const worker = {
    posted,
    terminated: false,
    postMessage(message: unknown) {
      posted.push(structuredClone(message) as PageMessage);
      heard?.();
    },
    addEventListener(type: string, listener: (event: MessageEvent & Event) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    terminate() {
      worker.terminated = true;
    },
    emit(type: string, data?: unknown) {
      for (const listener of listeners.get(type) ?? [])
        listener({ data } as unknown as MessageEvent & Event);
    },
    say(message: WorkerMessage) {
      worker.emit("message", message);
    },
    /** The next message the page sends past those already seen. */
    async sent(count: number): Promise<PageMessage> {
      while (posted.length < count) await new Promise<void>((resolve) => (heard = resolve));
      return posted[count - 1]!;
    },
  };
  return worker;
}

type Fake = ReturnType<typeof fakeWorker>;

/** An off-page runner over fake workers, each kept in `spawned` as it is started. */
function offPageOf(
  options: {
    deadlineMs?: number;
    workers?: number;
    workersInAll?: number;
    freeWhileWaiting?: boolean;
    idleMs?: number;
  } = {},
) {
  const spawned: Fake[] = [];
  const offPage = createOffPage({
    spawn: () => {
      const worker = fakeWorker();
      spawned.push(worker);
      return worker as WorkerLike;
    },
    config: CONFIG,
    ...options,
  });
  return { offPage, spawned };
}

const tooLarge = () => new ReadLimitError(DOC, { bytes: 1, quads: 1, characters: 1 });

afterEach(() => {
  vi.useRealTimers();
});

describe("createOffPage", () => {
  it("runs a job on a worker, with the page's fetches named by ids, and gives its result frozen where it was", async () => {
    const { offPage, spawned } = offPageOf();
    const fetch = vi.fn<typeof globalThis.fetch>();
    const result = offPage.run({ job: "echo", input: { a: 1 }, fetches: { doc: fetch }, tooLarge });
    const run = await vi.waitFor(() => spawned[0]!.sent(1));
    expect(run).toEqual({
      type: "run",
      job: "echo",
      input: { a: 1 },
      config: CONFIG,
      fetches: { doc: 1 },
      budget: false,
    });
    spawned[0]!.say({ type: "done", result: { list: [1] }, frozen: [["list"]] });
    const value = await result;
    expect(value).toEqual({ list: [1] });
    expect(Object.isFrozen((value as { list: number[] }).list)).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
  });

  it("keeps a worker done with its job for the next, the same fetch by the same id, and ends it once no job needs it for a while", async () => {
    vi.useFakeTimers();
    const { offPage, spawned } = offPageOf({ idleMs: 1000 });
    const fetch = vi.fn<typeof globalThis.fetch>();
    const first = offPage.run({ job: "a", input: null, fetches: { doc: fetch }, tooLarge });
    await vi.advanceTimersByTimeAsync(0);
    spawned[0]!.say({ type: "done", result: 1, frozen: [] });
    await first;
    // What a worker says while no job runs on it is not heard.
    spawned[0]!.say({ type: "done", result: "stray", frozen: [] });
    const second = offPage.run({ job: "b", input: null, fetches: { other: fetch }, tooLarge });
    await vi.advanceTimersByTimeAsync(0);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.posted[1]).toMatchObject({ job: "b", fetches: { other: 1 } });
    spawned[0]!.say({ type: "done", result: 2, frozen: [] });
    expect(await second).toBe(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(spawned[0]!.terminated).toBe(true);
    const third = offPage.run({ job: "c", input: null, tooLarge });
    await vi.advanceTimersByTimeAsync(0);
    expect(spawned).toHaveLength(2);
    spawned[1]!.say({ type: "done", result: 3, frozen: [] });
    expect(await third).toBe(3);
  });

  it("lets a worker that fails while no job needs it go, and starts another for the next job", async () => {
    const { offPage, spawned } = offPageOf();
    const first = offPage.run({ job: "a", input: null, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    spawned[0]!.say({ type: "done", result: 1, frozen: [] });
    await first;
    spawned[0]!.emit("error");
    expect(spawned[0]!.terminated).toBe(true);
    const next = offPage.run({ job: "b", input: null, tooLarge });
    await vi.waitFor(() => spawned[1]!.sent(1));
    spawned[1]!.say({ type: "done", result: 2, frozen: [] });
    expect(await next).toBe(2);
  });

  it("runs as many jobs at once as it has workers, the next waiting for one to be done", async () => {
    const { offPage, spawned } = offPageOf({ workers: 1 });
    const first = offPage.run({ job: "a", input: null, tooLarge });
    const second = offPage.run({ job: "b", input: null, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    expect(spawned).toHaveLength(1);
    expect(spawned[0]!.posted).toHaveLength(1);
    spawned[0]!.say({ type: "done", result: 1, frozen: [] });
    expect(await first).toBe(1);
    expect(await spawned[0]!.sent(2)).toMatchObject({ job: "b" });
    spawned[0]!.say({ type: "done", result: 2, frozen: [] });
    expect(await second).toBe(2);
  });

  it("keeps a job's worker counted while it waits for its requests, unless asked to free it", async () => {
    const { offPage, spawned } = offPageOf({ workers: 1 });
    let answer: (() => void) | undefined;
    const slow: typeof globalThis.fetch = () =>
      new Promise((resolve) => (answer = () => resolve(new Response("late"))));
    const waits = offPage.run({ job: "a", input: null, fetches: { slow }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    const next = offPage.run({ job: "b", input: null, tooLarge });
    spawned[0]!.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    await vi.waitFor(() => expect(answer).toBeDefined());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spawned).toHaveLength(1);
    // The worker ends while its job waits: the next job gets a worker of its own.
    spawned[0]!.emit("error");
    await expect(waits).rejects.toBeInstanceOf(ReadLimitError);
    expect(spawned).toHaveLength(2);
    spawned[1]!.say({ type: "done", result: 2, frozen: [] });
    expect(await next).toBe(2);
  });

  it("with `freeWhileWaiting`, counts no job waiting for its requests as working: another works on a worker of its own, up to the workers there may be", async () => {
    const { offPage, spawned } = offPageOf({ workers: 1, workersInAll: 2, freeWhileWaiting: true });
    let answer: (() => void) | undefined;
    const slow: typeof globalThis.fetch = () =>
      new Promise((resolve) => (answer = () => resolve(new Response("late"))));
    const waits = offPage.run({ job: "a", input: null, fetches: { slow }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    const second = offPage.run({ job: "b", input: null, tooLarge });
    const third = offPage.run({ job: "c", input: null, tooLarge });
    expect(spawned).toHaveLength(1);
    spawned[0]!.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    // The first waits for its request: the second works on a second worker, the third waits for one.
    expect(await spawned[1]!.sent(1)).toMatchObject({ job: "b" });
    expect(spawned).toHaveLength(2);
    answer!();
    await spawned[0]!.sent(2);
    spawned[1]!.say({ type: "done", result: 2, frozen: [] });
    expect(await second).toBe(2);
    // The third works once the first is done working, on the worker last left idle.
    spawned[0]!.say({ type: "done", result: 1, frozen: [] });
    expect(await waits).toBe(1);
    expect(await spawned[0]!.sent(3)).toMatchObject({ job: "c" });
    spawned[0]!.say({ type: "done", result: 3, frozen: [] });
    expect(await third).toBe(3);
  });

  it("starts no worker past the workers there may be, though the jobs on them wait for their requests", async () => {
    const { offPage, spawned } = offPageOf({ workers: 1, workersInAll: 1, freeWhileWaiting: true });
    const never: typeof globalThis.fetch = () => new Promise(() => {});
    const waits = offPage.run({ job: "a", input: null, fetches: { never }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    const next = offPage.run({ job: "b", input: null, tooLarge });
    spawned[0]!.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spawned).toHaveLength(1);
    // The worker ends while its job waits for a request: the job is too large, and the next gets a worker.
    spawned[0]!.emit("error");
    await expect(waits).rejects.toBeInstanceOf(ReadLimitError);
    expect(await spawned[1]!.sent(1)).toMatchObject({ job: "b" });
    spawned[1]!.say({ type: "done", result: 2, frozen: [] });
    expect(await next).toBe(2);
  });

  it("fails a job waiting for a worker that cannot be started", async () => {
    let started = 0;
    const workers: Fake[] = [];
    const offPage = createOffPage({
      spawn: () => {
        if (++started > 1) throw new Error("no more workers");
        const worker = fakeWorker();
        workers.push(worker);
        return worker as WorkerLike;
      },
      config: CONFIG,
      workers: 1,
    });
    const first = offPage.run({ job: "a", input: null, tooLarge });
    const second = offPage.run({ job: "b", input: null, tooLarge });
    await vi.waitFor(() => workers[0]!.sent(1));
    workers[0]!.emit("error");
    await expect(first).rejects.toBeInstanceOf(ReadLimitError);
    await expect(second).rejects.toThrow("no more workers");
  });

  it("ends a worker past the job's deadline, fails the job as too large, and starts another for the job waiting", async () => {
    vi.useFakeTimers();
    const { offPage, spawned } = offPageOf({ workers: 1, deadlineMs: 1000 });
    const first = offPage.run({ job: "slow", input: null, tooLarge });
    const failed = expect(first).rejects.toBeInstanceOf(ReadLimitError);
    const second = offPage.run({ job: "next", input: null, tooLarge });
    await vi.advanceTimersByTimeAsync(999);
    expect(spawned[0]!.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    expect(spawned[0]!.terminated).toBe(true);
    // Whatever the ended worker says after is not heard.
    spawned[0]!.say({ type: "done", result: "late", frozen: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(spawned[1]!.posted[0]).toMatchObject({ job: "next" });
    spawned[1]!.say({ type: "done", result: 2, frozen: [] });
    expect(await second).toBe(2);
  });

  it("fails the job as too large when its worker ends, or cannot read what it sends", async () => {
    const { offPage, spawned } = offPageOf();
    const ended = offPage.run({
      job: "a",
      input: null,
      tooLarge: () => new AppError("deckFileTooLarge"),
    });
    await vi.waitFor(() => spawned[0]!.sent(1));
    spawned[0]!.emit("error");
    await expect(ended).rejects.toMatchObject({ code: "deckFileTooLarge" });
    const garbled = offPage.run({ job: "b", input: null, tooLarge });
    await vi.waitFor(() => spawned[1]!.sent(1));
    spawned[1]!.emit("messageerror");
    await expect(garbled).rejects.toBeInstanceOf(ReadLimitError);
  });

  it("fails a job whose worker cannot be started, and tries again for the next", async () => {
    let fails = true;
    const offPage = createOffPage({
      spawn: () => {
        if (fails) throw new Error("no workers here");
        fails = true;
        const worker = fakeWorker();
        setTimeout(() => worker.say({ type: "done", result: "ran", frozen: [] }), 0);
        return worker as WorkerLike;
      },
      config: CONFIG,
      workers: 1,
    });
    await expect(offPage.run({ job: "a", input: null, tooLarge })).rejects.toThrow(
      "no workers here",
    );
    fails = false;
    expect(await offPage.run({ job: "a", input: null, tooLarge })).toBe("ran");
  });

  it("gives what the job failed with, the page's own error as the very one it was", async () => {
    const { offPage, spawned } = offPageOf();
    const failing = vi.fn<typeof globalThis.fetch>(async () => {
      throw offline;
    });
    const offline = new TypeError("offline");
    const sent = offPage.run({ job: "a", input: null, fetches: { doc: failing }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    spawned[0]!.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    const rejected = await spawned[0]!.sent(2);
    expect(rejected).toEqual({
      type: "rejected",
      call: 1,
      error: { kind: "error", name: "TypeError", message: "offline", ref: 1 },
    });
    spawned[0]!.say({
      type: "failed",
      error: { kind: "error", name: "TypeError", message: "offline", ref: 1 },
    });
    await expect(sent).rejects.toBe(offline);

    const own = offPage.run({ job: "b", input: null, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(3));
    spawned[0]!.say({ type: "failed", error: { kind: "app", code: "notADeckFile", vars: {} } });
    await expect(own).rejects.toMatchObject({ code: "notADeckFile" });
  });

  it("makes a job's request with the page's fetch, sending its answer whole, with the limits it is read under, and counts the job's parse in the page's tally", async () => {
    vi.useFakeTimers();
    const { offPage, spawned } = offPageOf({ deadlineMs: 1000 });
    const spent = noneSpent();
    let answer: (() => void) | undefined;
    const asked: RequestInit[] = [];
    const served: typeof globalThis.fetch = async (_input, init) => {
      asked.push(init!);
      // The page's fetch takes longer than the job's deadline: its clock stands still meanwhile.
      await new Promise<void>((resolve) => (answer = resolve));
      return new Response("<a> <b> <c>.", { headers: { "Content-Type": "text/turtle" } });
    };
    const fetch = limitedFetch(served, { bytes: 100, quads: 10, characters: 1000 }, spent);
    // A browser may give a 304 an empty body.
    const head: typeof globalThis.fetch = async () =>
      Object.defineProperty(new Response(null, { status: 304 }), "body", {
        value: new ReadableStream(),
      });
    const result = offPage.run({ job: "a", input: null, fetches: { doc: fetch, head }, tooLarge });
    await vi.advanceTimersByTimeAsync(0);
    const worker = spawned[0]!;
    worker.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [["accept", "text/turtle"]], cache: "no-store" },
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(worker.terminated).toBe(false);
    expect(asked[0]).toMatchObject({
      method: "GET",
      headers: [["accept", "text/turtle"]],
      cache: "no-store",
    });
    answer!();
    await vi.advanceTimersByTimeAsync(0);
    const response = worker.posted[1] as Extract<PageMessage, { type: "response" }>;
    expect(response).toMatchObject({
      type: "response",
      call: 1,
      response: {
        status: 200,
        read: { limits: { bytes: 100, quads: 10 }, spent: { bytes: 12, quads: 0, characters: 0 } },
      },
    });
    expect(new TextDecoder().decode(response.response.body!)).toBe("<a> <b> <c>.");
    worker.say({ type: "tally", call: 1, quads: 1, characters: 30 });
    expect(spent).toEqual({ bytes: 12, quads: 1, characters: 30 });

    worker.say({
      type: "fetch",
      call: 2,
      fetch: 2,
      url: DOC,
      init: { method: "HEAD", headers: [] },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.posted[2]).toMatchObject({
      type: "response",
      call: 2,
      response: { status: 304, body: null },
    });
    expect((worker.posted[2] as { response: object }).response).not.toHaveProperty("read");
    worker.say({ type: "done", result: "parsed", frozen: [] });
    expect(await result).toBe("parsed");
  });

  it("sends the limit a body went past as the page read it, and aborts a request the job aborts or ends before it is answered", async () => {
    const { offPage, spawned } = offPageOf();
    const big = limitedFetch(async () => new Response("x".repeat(50)), {
      bytes: 10,
      quads: 1,
      characters: 1,
    });
    const signals: AbortSignal[] = [];
    const hanging: typeof globalThis.fetch = (_input, init) => {
      signals.push(init!.signal!);
      return new Promise((_, reject) =>
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)),
      );
    };
    const result = offPage.run({ job: "a", input: null, fetches: { big, hanging }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    const worker = spawned[0]!;
    worker.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    expect(await worker.sent(2)).toMatchObject({
      type: "rejected",
      call: 1,
      error: { kind: "limit", limits: { bytes: 10 } },
    });
    worker.say({
      type: "fetch",
      call: 2,
      fetch: 2,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    worker.say({ type: "abort", call: 2 });
    expect(await worker.sent(3)).toMatchObject({
      type: "rejected",
      call: 2,
      error: { name: "AbortError" },
    });
    // An abort of a request already answered changes nothing.
    worker.say({ type: "abort", call: 2 });
    worker.say({
      type: "fetch",
      call: 3,
      fetch: 2,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    worker.say({ type: "done", result: "ok", frozen: [] });
    expect(await result).toBe("ok");
    expect(signals[1]!.aborted).toBe(true);
    // The request ended with the job is not answered.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(worker.posted).toHaveLength(3);
  });

  it("sends what a body failed with as it came, the limit it went past as the page read it, while other requests are under way", async () => {
    const { offPage, spawned } = offPageOf();
    const streaming =
      (fail: () => unknown): typeof globalThis.fetch =>
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("x".repeat(20)));
            },
            pull(controller) {
              controller.error(fail());
            },
          }),
        );
    const past = limitedFetch(
      streaming(() => new Error("cut")),
      { bytes: 10, quads: 1, characters: 1 },
    );
    const cut = streaming(() => new AppError("podNoAnswer"));
    const result = offPage.run({ job: "a", input: null, fetches: { past, cut }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    const worker = spawned[0]!;
    worker.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    worker.say({
      type: "fetch",
      call: 2,
      fetch: 2,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    await worker.sent(3);
    expect(worker.posted.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ call: 1, error: expect.objectContaining({ kind: "limit" }) }),
        expect.objectContaining({
          call: 2,
          error: expect.objectContaining({ code: "podNoAnswer" }),
        }),
      ]),
    );
    worker.say({ type: "done", result: "ok", frozen: [] });
    expect(await result).toBe("ok");
  });

  it("refuses a request that would write, never sending it, and sends a read with only the headers a read needs", async () => {
    const { offPage, spawned } = offPageOf();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("read"));
    const result = offPage.run({ job: "a", input: null, fetches: { doc: fetch }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    const worker = spawned[0]!;
    worker.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "delete", headers: [] },
    });
    expect(await worker.sent(2)).toMatchObject({
      type: "rejected",
      call: 1,
      error: { name: "TypeError", message: "A read off the page only reads: DELETE" },
    });
    expect(fetch).not.toHaveBeenCalled();
    worker.say({
      type: "fetch",
      call: 2,
      fetch: 1,
      url: DOC,
      init: {
        method: "GET",
        headers: [
          ["Accept", "text/turtle"],
          ["if-none-match", '"v1"'],
          ["Range", "bytes=0-9"],
          ["If-Modified-Since", "Tue, 01 Jan 2030 00:00:00 GMT"],
          ["authorization", "DPoP token"],
          ["DPoP", "proof"],
          ["Cookie", "session=1"],
          ["Content-Type", "text/turtle"],
        ],
        cache: "no-store",
        redirect: "follow",
      },
    });
    await worker.sent(3);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(DOC);
    expect(init).toMatchObject({ method: "GET", cache: "no-store", redirect: "follow" });
    expect(init!.headers).toEqual([
      ["Accept", "text/turtle"],
      ["if-none-match", '"v1"'],
      ["Range", "bytes=0-9"],
      ["If-Modified-Since", "Tue, 01 Jan 2030 00:00:00 GMT"],
    ]);
    expect(Object.keys(init!).sort()).toEqual(["cache", "headers", "method", "redirect", "signal"]);
    worker.say({ type: "done", result: "ok", frozen: [] });
    expect(await result).toBe("ok");
  });

  it("names the budget a read's parse went past, as a read in the page would, and the limits a read went past otherwise", async () => {
    const limits = { bytes: 1000, quads: 100, characters: 10_000 };
    const budget = { bytes: 1000, quads: 3, characters: 10_000 };
    const served: typeof globalThis.fetch = async () =>
      Object.defineProperty(new Response("<a> <b> <c>."), "url", { value: DOC });
    const shared = () => sharedReadBudget({ limits, budget, rereads: noneSpent() })(served);
    const own = limitedFetch(served, limits);
    const failing = async (fetch: typeof globalThis.fetch, quads: number, url = DOC) => {
      const { offPage, spawned } = offPageOf();
      const result = offPage.run({ job: "a", input: null, fetches: { doc: fetch }, tooLarge });
      await vi.waitFor(() => spawned[0]!.sent(1));
      const worker = spawned[0]!;
      worker.say({
        type: "fetch",
        call: 1,
        fetch: 1,
        url: DOC,
        init: { method: "GET", headers: [] },
      });
      await worker.sent(2);
      worker.say({ type: "tally", call: 1, quads, characters: 0 });
      worker.say({ type: "failed", error: { kind: "limit", url, limits } });
      return result.then(
        () => Promise.reject(new Error("refused")),
        (error: ReadLimitError) => error,
      );
    };
    const past = await failing(shared(), 5);
    expect(past.limits).toBe(budget);
    expect(isPastBudget(past)).toBe(true);
    expect((await failing(own, 500)).limits).toEqual(limits);
    expect(isPastBudget(await failing(shared(), 5, "https://bob.example/other.ttl"))).toBe(false);
  });

  it("sends nothing of an answer that comes after the job is done", async () => {
    const { offPage, spawned } = offPageOf();
    let answer: (() => void) | undefined;
    const late: typeof globalThis.fetch = () =>
      new Promise((resolve) => (answer = () => resolve(new Response("late"))));
    const result = offPage.run({ job: "a", input: null, fetches: { late }, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    spawned[0]!.say({
      type: "fetch",
      call: 1,
      fetch: 1,
      url: DOC,
      init: { method: "GET", headers: [] },
    });
    await vi.waitFor(() => expect(answer).toBeDefined());
    spawned[0]!.say({ type: "done", result: "ok", frozen: [] });
    await result;
    answer!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spawned[0]!.posted).toHaveLength(1);
  });

  it("spends the page's budget for the job's reads: says when a read may start, and when the budget is spent", async () => {
    const { offPage, spawned } = offPageOf();
    let spentOut = false;
    const budget = {
      async spend<T>(otherwise: T, read: () => Promise<T>): Promise<T> {
        if (spentOut) return otherwise;
        return read();
      },
    };
    const result = offPage.run({ job: "a", input: null, budget, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    const worker = spawned[0]!;
    expect(worker.posted[0]).toMatchObject({ budget: true });
    worker.say({ type: "spend", call: 1 });
    expect(await worker.sent(2)).toEqual({ type: "budget", call: 1, event: "start" });
    worker.say({ type: "spendDone", call: 1 });
    // One done twice, or not under way, changes nothing.
    worker.say({ type: "spendDone", call: 1 });
    spentOut = true;
    worker.say({ type: "spend", call: 2 });
    expect(await worker.sent(3)).toEqual({ type: "budget", call: 2, event: "spent" });
    spentOut = false;
    worker.say({ type: "spend", call: 3 });
    expect(await worker.sent(4)).toEqual({ type: "budget", call: 3, event: "start" });
    worker.say({ type: "done", result: "ok", frozen: [] });
    expect(await result).toBe("ok");
  });

  it("says nothing of a budget spent after the job is done", async () => {
    const { offPage, spawned } = offPageOf();
    let spend: (() => void) | undefined;
    const budget = {
      spend<T>(otherwise: T): Promise<T> {
        return new Promise((resolve) => (spend = () => resolve(otherwise)));
      },
    };
    const result = offPage.run({ job: "a", input: null, budget, tooLarge });
    await vi.waitFor(() => spawned[0]!.sent(1));
    spawned[0]!.say({ type: "spend", call: 1 });
    spawned[0]!.say({ type: "done", result: "ok", frozen: [] });
    await result;
    spend!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spawned[0]!.posted).toHaveLength(1);
  });
});
