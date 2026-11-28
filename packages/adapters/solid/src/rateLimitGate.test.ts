// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import {
  BACKOFF_CAP_MS,
  BURST_FAILURES,
  BURST_MS,
  createRateLimitGate,
  GATE_TRIES,
  GATE_WAIT_MS,
  REFUSED_LATELY_MS,
  REQUESTS_AT_ONCE,
  RETRY_AFTER_CAP_MS,
  retryAfterMs,
  TURN_MS,
} from "./rateLimitGate";
import { READ_DEADLINE_MS, withReadDeadline } from "./readDeadline";

const POD = "https://pod.example/";

/** A refusal as a server that sends CORS headers on its 429 makes it, Retry-After shown when given. */
function tooMany(retryAfter?: string): Response {
  const headers = retryAfter === undefined ? undefined : { "Retry-After": retryAfter };
  return new Response("Too many requests", { status: 429, headers });
}

/** A network failure, as a browser shows a 429 sent without CORS headers. */
const corsLess = () => new TypeError("Failed to fetch");

/**
 * A server that gives each answer of `answers` in turn, the last one
 * again once they run out, and keeps when each request reached it and
 * what it was sent.
 */
function server(...answers: (() => Response | Error)[]) {
  const sent: { at: number; url: string; method: string; body: string | null }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    sent.push({
      at: Date.now(),
      url: request?.url ?? String(input),
      method: init?.method ?? request?.method ?? "GET",
      body:
        request === undefined ? ((init?.body as string | undefined) ?? null) : await request.text(),
    });
    const answer = answers[Math.min(sent.length - 1, answers.length - 1)]!();
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { fetch, sent };
}

const ok = () => new Response("ok");

describe("createRateLimitGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // On a whole second, as an HTTP-date names one.
    vi.setSystemTime(Date.parse("2026-11-28T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A gate whose backoff takes the middle of its range. */
  const gate = () => createRateLimitGate({ random: () => 0.5, online: () => true });

  it("sends a request again once the wait its server asks for in Retry-After has passed", async () => {
    const pod = server(() => tooMany("30"), ok);
    const start = Date.now();
    const read = gate().pace(pod.fetch)(`${POD}a.ttl`);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(pod.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await (await read).text()).toBe("ok");
    expect(pod.sent.map(({ at }) => at - start)).toEqual([0, 30_000]);
  });

  it("waits until the date Retry-After names, and no more than RETRY_AFTER_CAP_MS", async () => {
    const start = Date.now();
    const at = new Date(start + 45_000).toUTCString();
    const pod = server(
      () => tooMany(at),
      () => tooMany("86400"),
      ok,
    );
    const read = gate().pace(pod.fetch)(`${POD}a.ttl`);
    await vi.advanceTimersByTimeAsync(45_000 + RETRY_AFTER_CAP_MS);
    await read;
    expect(pod.sent.map(({ at }) => at - start)).toEqual([0, 45_000, 45_000 + RETRY_AFTER_CAP_MS]);
  });

  it("backs off, growing with jitter, while a server refuses without saying how long, and starts again once it answers", async () => {
    const answers = [tooMany, tooMany, tooMany, ok, tooMany, ok];
    const pod = server(...answers.map((answer) => () => answer()));
    const random = vi.fn(() => 0);
    const paced = createRateLimitGate({ random }).pace(pod.fetch);
    const start = Date.now();
    const first = paced(`${POD}a.ttl`);
    await vi.advanceTimersByTimeAsync(10_000);
    await first;
    const second = paced(`${POD}b.ttl`);
    await vi.advanceTimersByTimeAsync(10_000);
    await second;
    // Half of 1 s, 2 s and 4 s, at the least jitter; then half of 1 s again.
    expect(pod.sent.map(({ at }) => at - start)).toEqual([0, 500, 1500, 3500, 10_000, 10_500]);
    expect(random).toHaveBeenCalledTimes(4);
  });

  it("never backs off longer than BACKOFF_CAP_MS", async () => {
    const pod = server(() => tooMany());
    const paced = createRateLimitGate({ random: () => 0.999_999 }).pace(pod.fetch);
    for (const n of [1, 2]) {
      const read = paced(`${POD}${n}`);
      const failed = expect(read).rejects.toMatchObject({ code: "podBusy" });
      await vi.advanceTimersByTimeAsync(GATE_WAIT_MS);
      await failed;
    }
    // The second read's tries, once the backoff has grown past its cap.
    const tries = pod.sent.slice(GATE_TRIES);
    const gaps = tries.slice(1).map(({ at }, n) => at - tries[n]!.at);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(BACKOFF_CAP_MS);
    expect(Math.max(...gaps)).toBeGreaterThan(BACKOFF_CAP_MS - 1000);
  });

  it("holds every request to a server that asked to wait, reads and writes alike, through any fetch it paces, and none to another", async () => {
    const pod = server(() => tooMany("20"), ok);
    const other = server(ok);
    const shared = createRateLimitGate();
    const start = Date.now();
    const refused = shared.pace(pod.fetch)(`${POD}a.ttl`);
    await vi.advanceTimersByTimeAsync(0);
    const write = shared.pace(pod.fetch)(`${POD}b.ttl`, { method: "PATCH", body: "x" });
    const read = shared.pace(other.fetch)(`${POD}c.ttl`);
    const elsewhere = shared.pace(other.fetch)("https://other.example/d.ttl");
    await vi.advanceTimersByTimeAsync(0);
    expect(other.sent.map(({ url }) => url)).toEqual(["https://other.example/d.ttl"]);
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.all([refused, write, read, elsewhere]);
    expect(pod.sent.map(({ at, url }) => [at - start, url])).toEqual([
      [0, `${POD}a.ttl`],
      [20_000, `${POD}a.ttl`],
      [20_000, `${POD}b.ttl`],
    ]);
    expect(other.sent.map(({ at, url }) => [at - start, url])).toEqual([
      [0, "https://other.example/d.ttl"],
      [20_000, `${POD}c.ttl`],
    ]);
  });

  it("sends a write refused with 429 again, the same body, as the server did not act on it", async () => {
    const pod = server(() => tooMany("5"), ok);
    const request = new Request(`${POD}a.ttl`, { method: "PUT", body: "<a> <b> <c>." });
    const write = gate().pace(pod.fetch)(request);
    await vi.advanceTimersByTimeAsync(5000);
    expect((await write).status).toBe(200);
    expect(pod.sent.map(({ method, body }) => [method, body])).toEqual([
      ["PUT", "<a> <b> <c>."],
      ["PUT", "<a> <b> <c>."],
    ]);
  });

  it("sends a read refused with 503 and Retry-After again, and passes a write's 503 on, pausing the server for both", async () => {
    const unavailable = () => new Response("", { status: 503, headers: { "Retry-After": "10" } });
    const pod = server(unavailable, ok, unavailable, ok);
    const paced = gate().pace(pod.fetch);
    const read = paced(`${POD}a.ttl`);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await read).status).toBe(200);
    const write = await paced(`${POD}a.ttl`, { method: "POST", body: "x" });
    expect(write.status).toBe(503);
    const after = paced(`${POD}b.ttl`);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(pod.sent).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    await after;
    expect(pod.sent).toHaveLength(4);
  });

  it("lets a refusal's body go, though its stream has failed", async () => {
    const failing = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new TypeError("Connection closed"));
          },
        }),
        { status: 429, headers: { "Retry-After": "1" } },
      );
    const pod = server(failing, ok);
    const read = gate().pace(pod.fetch)(`${POD}a.ttl`);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await read).status).toBe(200);
  });

  it("passes a 503 without Retry-After on as it is, pausing nothing", async () => {
    const pod = server(() => new Response("", { status: 503 }), ok);
    const paced = gate().pace(pod.fetch);
    expect((await paced(`${POD}a.ttl`)).status).toBe(503);
    expect((await paced(`${POD}a.ttl`)).status).toBe(200);
  });

  it("fails with podBusy, naming the server and its wait, once the next try would pass GATE_WAIT_MS", async () => {
    const pod = server(() => tooMany("100"));
    const start = Date.now();
    const read = gate().pace(pod.fetch)(`${POD}a.ttl`);
    const failed = expect(read).rejects.toMatchObject({
      code: "podBusy",
      vars: { host: "pod.example", seconds: 100 },
    });
    await vi.advanceTimersByTimeAsync(GATE_WAIT_MS);
    await failed;
    expect(pod.sent.map(({ at }) => at - start)).toEqual([0, 100_000]);
  });

  it("fails with podBusy after GATE_TRIES tries", async () => {
    const pod = server(() => tooMany("0"));
    await expect(gate().pace(pod.fetch)(`${POD}a.ttl`)).rejects.toBeInstanceOf(AppError);
    expect(pod.sent).toHaveLength(GATE_TRIES);
  });

  it("sends a body from a stream once, failing with podBusy when it is refused", async () => {
    const pod = server(() => tooMany("1"));
    const body = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    const write = gate().pace(pod.fetch)(`${POD}a`, { method: "PUT", body });
    await expect(write).rejects.toMatchObject({ code: "podBusy", vars: { seconds: 1 } });
    expect(pod.sent).toHaveLength(1);
  });

  describe("a request that fails with no status", () => {
    it("fails as it did when it is alone, pausing nothing", async () => {
      const pod = server(corsLess, ok);
      const paced = gate().pace(pod.fetch);
      await expect(paced(`${POD}a.ttl`)).rejects.toBeInstanceOf(TypeError);
      expect((await paced(`${POD}a.ttl`)).status).toBe(200);
    });

    it(`counts as refused as the ${BURST_FAILURES}th in a burst, the read sent again after the backoff`, async () => {
      const pod = server(corsLess, corsLess, corsLess, ok);
      const paced = gate().pace(pod.fetch);
      const reads = [1, 2, 3].map((n) => paced(`${POD}${n}.ttl`));
      const settled = Promise.allSettled(reads);
      await vi.advanceTimersByTimeAsync(1000);
      expect(await settled).toMatchObject([
        { status: "rejected", reason: { name: "TypeError" } },
        { status: "rejected", reason: { name: "TypeError" } },
        { status: "fulfilled", value: { status: 200 } },
      ]);
      // Half of 1 s and half of it at random, at the middle.
      expect(pod.sent.at(-1)!.at - pod.sent[0]!.at).toBe(750);
    });

    it("isn't counted in a burst once BURST_MS has passed since the others", async () => {
      const pod = server(corsLess, corsLess, corsLess, ok);
      const paced = gate().pace(pod.fetch);
      await expect(paced(`${POD}a.ttl`)).rejects.toBeInstanceOf(TypeError);
      await vi.advanceTimersByTimeAsync(BURST_MS);
      await expect(paced(`${POD}a.ttl`)).rejects.toBeInstanceOf(TypeError);
      await expect(paced(`${POD}a.ttl`)).rejects.toBeInstanceOf(TypeError);
    });

    it("counts as refused within REFUSED_LATELY_MS of a refusal with a status, a write's failure passed on", async () => {
      const pod = server(() => tooMany("1"), ok, corsLess, corsLess, ok);
      const paced = gate().pace(pod.fetch);
      const read = paced(`${POD}a.ttl`);
      await vi.advanceTimersByTimeAsync(1000);
      await read;
      await vi.advanceTimersByTimeAsync(REFUSED_LATELY_MS - 2000);
      await expect(paced(`${POD}a`, { method: "PUT", body: "x" })).rejects.toBeInstanceOf(
        TypeError,
      );
      // The write's failure paused the server: the read after it waits.
      const again = paced(`${POD}a.ttl`);
      await vi.advanceTimersByTimeAsync(0);
      expect(pod.sent).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await again).status).toBe(200);
      expect(pod.sent).toHaveLength(5);
    });

    it("isn't counted as refused while the browser is offline, as its navigator says", async () => {
      vi.stubGlobal("navigator", { onLine: false });
      onTestFinished(() => {
        vi.unstubAllGlobals();
      });
      const pod = server(corsLess);
      const paced = createRateLimitGate().pace(pod.fetch);
      const reads = [1, 2, 3, 4].map((n) => paced(`${POD}${n}.ttl`));
      for (const read of reads) await expect(read).rejects.toBeInstanceOf(TypeError);
      expect(pod.sent).toHaveLength(4);
    });

    it("isn't counted when it is no network failure", async () => {
      const pod = server(
        () => tooMany(),
        () => new Error("other"),
      );
      // At random, the first wait of the backoff is a second at most.
      const paced = createRateLimitGate().pace(pod.fetch);
      const read = paced(`${POD}a.ttl`);
      const failed = expect(read).rejects.toThrow("other");
      await vi.advanceTimersByTimeAsync(1000);
      await failed;
    });

    it("fails with its last failure once its tries are spent, as a server that sends no status may be down", async () => {
      const pod = server(corsLess);
      const paced = gate().pace(pod.fetch);
      const reads = [1, 2, 3].map((n) => paced(`${POD}${n}.ttl`));
      const settled = Promise.allSettled(reads);
      await vi.advanceTimersByTimeAsync(GATE_WAIT_MS);
      for (const read of await settled)
        expect(read).toMatchObject({ status: "rejected", reason: { name: "TypeError" } });
      expect(pod.sent).toHaveLength(2 + GATE_TRIES);
    });
  });

  it("fails a request aborted while it waits as its signal says, sending it no more", async () => {
    const pod = server(() => tooMany("30"), ok);
    const paced = gate().pace(pod.fetch);
    const caller = new AbortController();
    const read = paced(`${POD}a.ttl`, { signal: caller.signal });
    const failed = expect(read).rejects.toBe("stop");
    await vi.advanceTimersByTimeAsync(1000);
    caller.abort("stop");
    await failed;
    // One aborted before it reaches the gate is never sent.
    await expect(paced(new Request(`${POD}b.ttl`, { signal: caller.signal }))).rejects.toBe("stop");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(pod.sent).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes on a failure of a request its caller aborted, counting it as no refusal", async () => {
    const caller = new AbortController();
    const pod = server(() => {
      caller.abort();
      return corsLess();
    });
    const paced = gate().pace(pod.fetch);
    for (const n of [1, 2, 3])
      await expect(paced(`${POD}${n}`, { signal: caller.signal })).rejects.toBeInstanceOf(
        TypeError,
      );
    expect(pod.sent).toHaveLength(3);
  });

  it("passes a request to no server, such as a data: URL, on as it is", async () => {
    const pod = server(() => tooMany("30"));
    const paced = gate().pace(pod.fetch);
    expect((await paced("data:text/plain,a")).status).toBe(429);
    expect((await paced("data:text/plain,a")).status).toBe(429);
  });

  describe("requests at once", () => {
    /** A server that answers each request only when the test says, by its address. */
    function held() {
      const asked: string[] = [];
      const answers = new Map<string, (response: Response | Error) => void>();
      const fetch = vi.fn(
        (input: RequestInfo | URL) =>
          new Promise<Response>((resolve, reject) => {
            const url = String(input);
            asked.push(url);
            answers.set(url, (answer) =>
              answer instanceof Error ? reject(answer) : resolve(answer),
            );
          }),
      );
      const answer = async (url: string, response: Response | Error = ok()) => {
        answers.get(url)!(response);
        await vi.advanceTimersByTimeAsync(0);
      };
      return { fetch, asked, answer };
    }

    const urls = (count: number, origin = POD) =>
      Array.from({ length: count }, (_, n) => `${origin}${n}.ttl`);

    it(`lets ${REQUESTS_AT_ONCE} limited requests go to one server at once, the next once one is answered, and holds none to another`, async () => {
      const pod = held();
      const paced = gate().pace(pod.fetch, { limited: true });
      const [first, ...rest] = urls(REQUESTS_AT_ONCE + 2);
      const all = [first!, ...rest].map((url) => paced(url));
      const elsewhere = paced("https://other.example/a.ttl");
      await vi.advanceTimersByTimeAsync(0);
      expect(pod.asked).toEqual([...urls(REQUESTS_AT_ONCE), "https://other.example/a.ttl"]);
      // A failure gives its turn up as an answer does.
      const failed = expect(all[0]).rejects.toThrow("down");
      await pod.answer(first!, new Error("down"));
      expect(pod.asked).toHaveLength(REQUESTS_AT_ONCE + 2);
      await pod.answer(rest[0]!);
      expect(pod.asked).toHaveLength(REQUESTS_AT_ONCE + 3);
      for (const url of [...rest.slice(1), "https://other.example/a.ttl"]) await pod.answer(url);
      await failed;
      await Promise.all([...all.slice(1), elsewhere]);
    });

    it(`gives a turn up after TURN_MS though its request is still under way, without aborting it`, async () => {
      const pod = held();
      const paced = gate().pace(pod.fetch, { limited: true });
      const writes = urls(REQUESTS_AT_ONCE).map((url) => paced(url, { method: "PUT", body: "x" }));
      const next = paced(`${POD}next.ttl`);
      await vi.advanceTimersByTimeAsync(TURN_MS - 1);
      expect(pod.asked).toHaveLength(REQUESTS_AT_ONCE);
      await vi.advanceTimersByTimeAsync(1);
      expect(pod.asked.at(-1)).toBe(`${POD}next.ttl`);
      await pod.answer(`${POD}next.ttl`);
      expect((await next).status).toBe(200);
      // The writes go on, and settle when the server answers them.
      for (const url of urls(REQUESTS_AT_ONCE)) await pod.answer(url);
      expect((await Promise.all(writes)).map(({ status }) => status)).toEqual(
        urls(REQUESTS_AT_ONCE).map(() => 200),
      );
    });

    it("hands out no turn more when a request settles after its turn was given up", async () => {
      const pod = held();
      const paced = createRateLimitGate({ atOnce: 1 }).pace(pod.fetch, { limited: true });
      const slow = paced(`${POD}slow.ttl`);
      const second = paced(`${POD}second.ttl`);
      const third = paced(`${POD}third.ttl`);
      await vi.advanceTimersByTimeAsync(TURN_MS);
      expect(pod.asked).toEqual([`${POD}slow.ttl`, `${POD}second.ttl`]);
      // The slow one settles: its turn was given up already, so the third still waits.
      await pod.answer(`${POD}slow.ttl`);
      expect(pod.asked).toHaveLength(2);
      await pod.answer(`${POD}second.ttl`);
      expect(pod.asked).toEqual([`${POD}slow.ttl`, `${POD}second.ttl`, `${POD}third.ttl`]);
      await pod.answer(`${POD}third.ttl`);
      await Promise.all([slow, second, third]);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("gives a turn up once the headers come, the body read in none", async () => {
      const pod = server(() => new Response("a body read later"));
      const paced = createRateLimitGate({ atOnce: 1 }).pace(pod.fetch, { limited: true });
      const unread = await paced(`${POD}a.ttl`);
      await paced(`${POD}b.ttl`);
      expect(await unread.text()).toBe("a body read later");
    });

    it("takes no turn for a fetch paced without the limit", async () => {
      const pod = held();
      const shared = createRateLimitGate({ atOnce: 1 });
      void shared.pace(pod.fetch, { limited: true })(`${POD}a.ttl`);
      void shared.pace(pod.fetch)(`${POD}b.ttl`);
      await vi.advanceTimersByTimeAsync(0);
      expect(pod.asked.sort()).toEqual([`${POD}a.ttl`, `${POD}b.ttl`]);
    });

    it("gives its turn up while its server's wait lasts, and sends a refused request again in a turn", async () => {
      const pod = held();
      const paced = createRateLimitGate({ atOnce: 1 }).pace(pod.fetch, { limited: true });
      const start = Date.now();
      const refused = paced(`${POD}a.ttl`);
      const next = paced(`${POD}b.ttl`);
      await vi.advanceTimersByTimeAsync(0);
      await pod.answer(`${POD}a.ttl`, tooMany("10"));
      // The turn went to the next in line, which found the server paused and waits too.
      expect(pod.asked).toEqual([`${POD}a.ttl`]);
      await vi.advanceTimersByTimeAsync(10_000);
      // Once it is over, one of them is sent, the other in the next turn.
      expect(pod.asked).toHaveLength(2);
      await pod.answer(pod.asked[1]!);
      expect([...pod.asked].sort()).toEqual([`${POD}a.ttl`, `${POD}a.ttl`, `${POD}b.ttl`]);
      await pod.answer(pod.asked[2]!);
      await Promise.all([refused, next]);
      expect(Date.now() - start).toBe(10_000);
    });

    it("fails a request aborted while it waits for a turn, before or in the line, leaving the line to the others", async () => {
      const pod = held();
      const paced = createRateLimitGate({ atOnce: 1 }).pace(pod.fetch, { limited: true });
      const first = paced(`${POD}a.ttl`);
      const caller = new AbortController();
      const leaving = paced(`${POD}b.ttl`, { signal: caller.signal });
      const last = paced(`${POD}c.ttl`);
      await vi.advanceTimersByTimeAsync(0);
      caller.abort("stop");
      await expect(leaving).rejects.toBe("stop");
      await expect(paced(`${POD}d.ttl`, { signal: caller.signal })).rejects.toBe("stop");
      await pod.answer(`${POD}a.ttl`);
      await pod.answer(`${POD}c.ttl`);
      await Promise.all([first, last]);
      expect(pod.asked).toEqual([`${POD}a.ttl`, `${POD}c.ttl`]);
    });
  });

  describe("before the read deadline", () => {
    it("lets a read wait as long as the server asks, its deadline running only once it is sent", async () => {
      const pod = server(() => tooMany("60"), ok);
      const read = gate().pace(withReadDeadline(pod.fetch))(`${POD}a.ttl`);
      await vi.advanceTimersByTimeAsync(60_000);
      expect((await read).status).toBe(200);
    });

    it("lets a read queued behind another's wait wait too, and still gives up on a server silent once it is sent", async () => {
      const silent = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      let refused = false;
      const pod = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (refused) return silent(input, init);
        refused = true;
        return Promise.resolve(tooMany("40"));
      });
      const paced = gate().pace(withReadDeadline(pod));
      const start = Date.now();
      const first = paced(`${POD}a.ttl`);
      await vi.advanceTimersByTimeAsync(0);
      const queued = paced(`${POD}b.ttl`);
      const failed = Promise.allSettled([first, queued]);
      await vi.advanceTimersByTimeAsync(40_000 + READ_DEADLINE_MS);
      expect(await failed).toMatchObject([
        { status: "rejected", reason: { code: "podNoAnswer" } },
        { status: "rejected", reason: { code: "podNoAnswer" } },
      ]);
      expect(Date.now() - start).toBe(40_000 + READ_DEADLINE_MS);
      expect(silent).toHaveBeenCalledTimes(2);
    });
  });
});

describe("retryAfterMs", () => {
  const now = Date.parse("2026-11-28T12:00:00Z");

  it.each([
    ["delta-seconds", " 30 ", 30_000],
    ["an HTTP-date", "Sat, 28 Nov 2026 12:01:00 GMT", 60_000],
    ["a date past", "Sat, 28 Nov 2026 11:00:00 GMT", 0],
    ["more than the cap", "3600", RETRY_AFTER_CAP_MS],
  ])("reads %s", (_kind, value, ms) => {
    expect(retryAfterMs(value, now)).toBe(ms);
  });

  it.each([
    ["no header", null],
    ["text that is neither", "soon"],
  ])("reads nothing from %s", (_kind, value) => {
    expect(retryAfterMs(value, now)).toBeUndefined();
  });
});
