// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { ReadLimitError } from "@solid-memo/solid-client/interface";
import { getSolidDatasetLinear } from "@solid-memo/solid-client/resources";
import { getThingAll } from "@solid-memo/solid-client/rdf";
import type { PageMessage, SentResponse, WorkerMessage } from "./offPageProtocol";
import { type JobEnv, type Jobs, serveOffPage } from "./offPageServe";

const CONFIG = { shapesBaseUrl: "s/", vocabBaseUrl: "v/", vendorBaseUrl: "x/" };
const DOC = "https://bob.example/doc.ttl";

/** A worker serving `jobs` over a channel, and the page's end of it: what it sends, and what it is sent. */
function served(jobs: Jobs) {
  const channel = new MessageChannel();
  serveOffPage(
    {
      postMessage: (message, transfer = []) => channel.port2.postMessage(message, transfer),
      addEventListener: (type, listener) => {
        channel.port2.addEventListener(type, listener);
        channel.port2.start();
      },
    },
    jobs,
  );
  const heard: WorkerMessage[] = [];
  let waiting: (() => void) | undefined;
  channel.port1.onmessage = (event) => {
    heard.push(event.data as WorkerMessage);
    waiting?.();
  };
  return {
    send: (message: PageMessage) => channel.port1.postMessage(message),
    run: (job: string, input: unknown = {}, more: Partial<PageMessage> = {}) =>
      channel.port1.postMessage({
        type: "run",
        job,
        input,
        config: CONFIG,
        fetches: { doc: 1 },
        budget: false,
        ...more,
      }),
    /** The next message the worker sends. */
    async next(): Promise<WorkerMessage> {
      while (heard.length === 0) await new Promise<void>((resolve) => (waiting = resolve));
      return heard.shift()!;
    },
    close: () => {
      channel.port1.close();
      channel.port2.close();
    },
  };
}

/** An answer as the page sends it. */
function answer(text: string, more: Partial<SentResponse> = {}): SentResponse {
  return {
    url: DOC,
    status: 200,
    statusText: "OK",
    redirected: false,
    headers: [["content-type", "text/turtle"]],
    body: new TextEncoder().encode(text).buffer as ArrayBuffer,
    ...more,
  };
}

describe("serveOffPage", () => {
  it("runs a job and sends its result, with the parts of it that are frozen", async () => {
    const worker = served({
      echo: async (_env, input: { word: string }) => Object.freeze({ said: input.word }),
    });
    worker.run("echo", { word: "hej" });
    expect(await worker.next()).toEqual({ type: "done", result: { said: "hej" }, frozen: [[]] });
    worker.close();
  });

  it("sends what a job fails with, and that there is no job of a name it does not know", async () => {
    const worker = served({
      refuse: async () => {
        throw new AppError("notADeckFile");
      },
      broken: () => {
        throw new TypeError("thrown at once");
      },
      odd: async () => {
        throw "no error";
      },
    });
    worker.run("refuse");
    expect(await worker.next()).toMatchObject({
      type: "failed",
      error: { kind: "app", code: "notADeckFile" },
    });
    worker.run("broken");
    expect(await worker.next()).toMatchObject({ type: "failed", error: { name: "TypeError" } });
    worker.run("none");
    expect(await worker.next()).toMatchObject({
      type: "failed",
      error: { kind: "error", message: "No job named none" },
    });
    worker.run("odd");
    expect(await worker.next()).toMatchObject({ type: "failed", error: { message: "no error" } });
    worker.close();
  });

  it("asks the page for each request, by the id of the page's fetch, and reads its answer as the page got it", async () => {
    const worker = served({
      read: async (env) => {
        const response = await env.fetch("doc")(DOC, {
          headers: { Accept: "text/turtle" },
          cache: "no-store",
          redirect: "follow",
        });
        return {
          status: response.status,
          url: response.url,
          redirected: response.redirected,
          type: response.headers.get("content-type"),
          text: await response.text(),
        };
      },
    });
    worker.run("read", {}, { fetches: { doc: 7 } });
    const asked = (await worker.next()) as Extract<WorkerMessage, { type: "fetch" }>;
    expect(asked).toMatchObject({
      type: "fetch",
      call: 1,
      fetch: 7,
      url: DOC,
      init: { method: "GET", cache: "no-store", redirect: "follow" },
    });
    expect(new Headers(asked.init.headers).get("Accept")).toBe("text/turtle");
    worker.send({
      type: "response",
      call: 1,
      response: answer("<a> <b> <c>.", { redirected: true }),
    });
    expect(await worker.next()).toEqual({
      type: "done",
      result: {
        status: 200,
        url: DOC,
        redirected: true,
        type: "text/turtle",
        text: "<a> <b> <c>.",
      },
      frozen: [],
    });
    worker.close();
  });

  it("asks with a Request's address and method, and reads an answer with no body", async () => {
    const worker = served({
      head: async (env) => {
        const response = await env.fetch("doc")(new Request(DOC, { method: "HEAD" }));
        return response.status;
      },
    });
    worker.run("head");
    expect(await worker.next()).toMatchObject({
      type: "fetch",
      url: DOC,
      init: { method: "HEAD", headers: [] },
    });
    worker.send({ type: "response", call: 1, response: answer("", { status: 304, body: null }) });
    expect(await worker.next()).toMatchObject({ type: "done", result: 304 });
    worker.close();
  });

  it("refuses a request that would write, and one by a name the job was not given, before the page hears of it", async () => {
    const worker = served({
      write: (env) => env.fetch("doc")(DOC, { method: "PUT", body: "x" }),
      other: (env) => env.fetch("other")(DOC),
    });
    worker.run("write");
    expect(await worker.next()).toMatchObject({
      type: "failed",
      error: { name: "TypeError", message: "A read off the page only reads: PUT" },
    });
    worker.run("other");
    expect(await worker.next()).toMatchObject({
      type: "failed",
      error: { message: "The job has no fetch named other" },
    });
    worker.close();
  });

  it("fails a request as the page's did, giving back the page's id of it, and a request aborted before or while the page makes it", async () => {
    const aborted = new AbortController();
    aborted.abort(new DOMException("gone", "AbortError"));
    const later = new AbortController();
    const worker = served({
      fails: (env) => env.fetch("doc")(DOC),
      early: (env) => env.fetch("doc")(DOC, { signal: aborted.signal }),
      late: async (env) => {
        const reading = env.fetch("doc")(DOC, { signal: later.signal });
        later.abort(new DOMException("stop", "AbortError"));
        return reading;
      },
      after: async (env) => {
        const done = new AbortController();
        const response = await env.fetch("doc")(DOC, { signal: done.signal });
        done.abort();
        return response.status;
      },
    });
    worker.run("fails");
    const { call } = (await worker.next()) as Extract<WorkerMessage, { type: "fetch" }>;
    worker.send({
      type: "rejected",
      call,
      error: { kind: "error", name: "TypeError", message: "offline", ref: 4 },
    });
    expect(await worker.next()).toMatchObject({
      type: "failed",
      error: { name: "TypeError", ref: 4 },
    });

    worker.run("early");
    expect(await worker.next()).toMatchObject({
      type: "failed",
      error: { name: "AbortError", message: "gone" },
    });

    worker.run("late");
    expect(await worker.next()).toMatchObject({ type: "fetch" });
    const abort = (await worker.next()) as Extract<WorkerMessage, { type: "abort" }>;
    expect(abort.type).toBe("abort");
    expect(await worker.next()).toMatchObject({
      type: "failed",
      error: { name: "AbortError", message: "stop" },
    });
    // An answer after the abort goes nowhere.
    worker.send({ type: "response", call: abort.call, response: answer("") });
    worker.run("early");
    expect(await worker.next()).toMatchObject({ type: "failed" });

    // An abort after the answer came asks nothing of the page.
    worker.run("after");
    const asked = (await worker.next()) as Extract<WorkerMessage, { type: "fetch" }>;
    worker.send({ type: "response", call: asked.call, response: answer("") });
    expect(await worker.next()).toMatchObject({ type: "done", result: 200 });
    worker.close();
  });

  it("parses an answer under the page's limits, counting on from what the page spent, and sends the page what the parse counted", async () => {
    const limits = { bytes: 1000, quads: 3, characters: 10_000 };
    const worker = served({
      parse: async (env) =>
        getThingAll(await getSolidDatasetLinear(DOC, { fetch: env.fetch("doc") })).length,
    });
    const text = "<a> <b> <c>. <d> <b> <c>.";
    const bytes = new TextEncoder().encode(text).byteLength;
    worker.run("parse");
    let { call } = (await worker.next()) as Extract<WorkerMessage, { type: "fetch" }>;
    worker.send({
      type: "response",
      call,
      response: answer(text, {
        read: { limits, spent: { bytes: bytes + 10, quads: 1, characters: 0 } },
      }),
    });
    const tally = await worker.next();
    expect(tally).toMatchObject({ type: "tally", call, quads: 2 });
    expect((tally as { characters: number }).characters).toBeGreaterThan(0);
    expect(await worker.next()).toMatchObject({ type: "done", result: 2 });

    // Past the limits with what the page spent before.
    worker.run("parse");
    ({ call } = (await worker.next()) as Extract<WorkerMessage, { type: "fetch" }>);
    worker.send({
      type: "response",
      call,
      response: answer(text, { read: { limits, spent: { bytes, quads: 2, characters: 0 } } }),
    });
    expect(await worker.next()).toMatchObject({ type: "tally", call });
    const failed = await worker.next();
    expect(failed).toMatchObject({ type: "failed", error: { kind: "limit", url: DOC, limits } });
    expect(new ReadLimitError(DOC, limits)).toBeInstanceOf(Error);
    worker.close();
  });

  it("keeps one bridged fetch for each of the page's fetches, the last sixteen asked for", async () => {
    let first: typeof globalThis.fetch | undefined;
    const worker = served({
      same: async (env) => {
        first ??= env.fetch("doc");
        return env.fetch("doc") === first;
      },
      many: async (env: JobEnv) => {
        for (let id = 2; id <= 17; id++) env.fetch(String(id));
        return env.fetch("doc") === first;
      },
    });
    worker.run("same");
    expect(await worker.next()).toMatchObject({ result: true });
    worker.run("same");
    expect(await worker.next()).toMatchObject({ result: true });
    const fetches = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => [String(index + 2), index + 2]),
    );
    worker.run("many", {}, { fetches: { doc: 1, ...fetches } });
    expect(await worker.next()).toMatchObject({ result: false });
    worker.close();
  });

  it("spends the page's budget on a read: the read starts when the page says so, and gives up when it says the budget is spent", async () => {
    let release: (() => void) | undefined;
    const worker = served({
      spend: (env) =>
        env.budget!.spend("spent", async () => {
          await new Promise<void>((resolve) => (release = resolve));
          return "read";
        }),
      fails: (env) =>
        env.budget!.spend("spent", async () => {
          throw new AppError("podNoAnswer");
        }),
      none: async (env) => env.budget === undefined,
    });
    const budget = { budget: true };

    worker.run("spend", {}, budget);
    let { call } = (await worker.next()) as Extract<WorkerMessage, { type: "spend" }>;
    worker.send({ type: "budget", call, event: "start" });
    await expect.poll(() => release).toBeDefined();
    release!();
    expect(await worker.next()).toEqual({ type: "spendDone", call });
    expect(await worker.next()).toMatchObject({ type: "done", result: "read" });

    // Spent before it starts.
    worker.run("spend", {}, budget);
    ({ call } = (await worker.next()) as Extract<WorkerMessage, { type: "spend" }>);
    worker.send({ type: "budget", call, event: "spent" });
    expect(await worker.next()).toMatchObject({ type: "done", result: "spent" });

    // Spent while it reads: what the read gives after is let go.
    release = undefined;
    worker.run("spend", {}, budget);
    ({ call } = (await worker.next()) as Extract<WorkerMessage, { type: "spend" }>);
    worker.send({ type: "budget", call, event: "start" });
    await expect.poll(() => release).toBeDefined();
    worker.send({ type: "budget", call, event: "spent" });
    expect(await worker.next()).toMatchObject({ type: "done", result: "spent" });
    release!();

    worker.run("fails", {}, budget);
    ({ call } = (await worker.next()) as Extract<WorkerMessage, { type: "spend" }>);
    worker.send({ type: "budget", call, event: "start" });
    expect(await worker.next()).toEqual({ type: "spendDone", call });
    expect(await worker.next()).toMatchObject({ type: "failed", error: { code: "podNoAnswer" } });

    worker.run("none");
    expect(await worker.next()).toMatchObject({ result: true });
    worker.close();
  });

  it("lets a read whose budget was spent fail unheard", async () => {
    let fail: ((error: Error) => void) | undefined;
    const worker = served({
      spend: (env) =>
        env.budget!.spend("spent", () => new Promise<string>((_, reject) => (fail = reject))),
    });
    worker.run("spend", {}, { budget: true });
    const { call } = (await worker.next()) as Extract<WorkerMessage, { type: "spend" }>;
    worker.send({ type: "budget", call, event: "start" });
    await expect.poll(() => fail).toBeDefined();
    worker.send({ type: "budget", call, event: "spent" });
    expect(await worker.next()).toMatchObject({ type: "done", result: "spent" });
    fail!(new Error("late"));
    worker.run("spend", {}, { budget: true });
    expect(await worker.next()).toMatchObject({ type: "spend" });
    worker.close();
  });
});
