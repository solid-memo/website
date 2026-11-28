// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The rate-limit gate (docs/architecture.md#a-request-on-its-way-to-a-pod):
 * one wait per server, shared by every request the gate passes to it,
 * reads and writes alike. A server that refuses a request as too many
 * (429), or as unavailable for a while (503 with Retry-After), pauses
 * every request to its origin for as long as it asks, or, when the
 * browser doesn't show how long, for a backoff that grows while it keeps
 * refusing. The refused request is sent again after the wait, so neither
 * the queries' own retries nor the answer queue send into the limit.
 */

import { AppError } from "@solid-memo/domain/appError";

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The longest wait a server's Retry-After is taken at, in milliseconds: a longer one is cut to it. */
export const RETRY_AFTER_CAP_MS = 120_000;

/** The first wait of the backoff, in milliseconds, when the server says nothing of how long. */
const BACKOFF_FIRST_MS = 1_000;

/** The longest wait of the backoff, in milliseconds, however long the server keeps refusing. */
export const BACKOFF_CAP_MS = 60_000;

/**
 * How long one request may be held at the gate in all, in milliseconds,
 * from when it reaches it: a request whose next try would come later
 * fails instead (podBusy), so no screen waits on a server for good.
 */
export const GATE_WAIT_MS = 180_000;

/** How many times one request is sent at most. */
export const GATE_TRIES = 6;

/**
 * How long after a server refused a request a request to it that fails
 * with no status at all counts as refused too, in milliseconds: a proxy
 * may send its 429s without CORS headers, which the browser shows as a
 * network failure.
 */
export const REFUSED_LATELY_MS = 60_000;

/**
 * How many requests to one server must fail with no status within
 * BURST_MS for those failures to count as refusals: a rate limit
 * refuses the many requests of a page together, where a dropped
 * connection fails the one under way.
 */
export const BURST_FAILURES = 3;

/** The window BURST_FAILURES counts in, in milliseconds. */
export const BURST_MS = 2_000;

/** What the gate keeps of one origin. */
interface Origin {
  /** The host, as the learner sees it. */
  host: string;
  /** The time no request is sent before, in milliseconds since the epoch; 0 when none. */
  until: number;
  /** The refusals in a row, which the backoff grows with; a response that isn't one starts it again. */
  refusals: number;
  /** When the server last refused a request, with a status or a failure counted as one, in milliseconds since the epoch. */
  refusedAt: number;
  /** When requests to it failed with no status lately, within BURST_MS. */
  failures: number[];
}

/** What the gate is given; each has the browser's own by default, and a test gives its own. */
export interface GateOptions {
  /** The time, in milliseconds since the epoch. */
  now?: () => number;
  /** A number in [0, 1), for the backoff's jitter. */
  random?: () => number;
  /** Settles after `ms`, or fails as `signal` says once it is aborted. */
  sleep?: (ms: number, signal: AbortSignal | undefined) => Promise<void>;
  /** Whether the browser thinks it is online: a failure while it isn't is no refusal. */
  online?: () => boolean;
}

/** The gate: `pace` wraps a fetch, its requests passing the gate, every wrapped fetch sharing its waits. */
export interface RateLimitGate {
  pace(fetch: typeof globalThis.fetch): typeof globalThis.fetch;
}

/**
 * A gate with one wait per origin, which every fetch it paces shares.
 * A request waits while its origin is paused, then is sent. Refused with
 * 429, whatever its method, or with 503 and Retry-After when it only
 * reads, it is sent again after the wait: the server didn't act on it.
 * A write refused with 503 pauses the origin, and its answer is passed
 * on as it is, as the server may have acted on it. A request that fails
 * with no status (a TypeError) counts as refused only while its origin
 * is paused, within REFUSED_LATELY_MS of a refusal (with a status, or a
 * failure counted as one), or as the BURST_FAILURES-th such failure
 * within BURST_MS, and only while the browser is online; a read is then
 * sent again, and a write's failure is passed on. Past GATE_TRIES, or
 * when the next try would come after GATE_WAIT_MS, it fails: with
 * podBusy when the server refused it with a status, with its last
 * failure otherwise, as a server that sends no status may be down
 * instead. A request aborted while it waits fails as its signal says.
 */
export function createRateLimitGate({
  now = () => Date.now(),
  random = () => Math.random(),
  sleep = sleepFor,
  online = () => globalThis.navigator?.onLine !== false,
}: GateOptions = {}): RateLimitGate {
  const origins = new Map<string, Origin>();

  function originOf(url: URL): Origin {
    let origin = origins.get(url.origin);
    if (origin === undefined) {
      origin = {
        host: url.host,
        until: 0,
        refusals: 0,
        refusedAt: -Infinity,
        failures: [],
      };
      origins.set(url.origin, origin);
    }
    return origin;
  }

  /** Pauses `origin` for `ms` from now, unless it is paused longer already. */
  function pause(origin: Origin, ms: number): void {
    origin.until = Math.max(origin.until, now() + ms);
  }

  /** The backoff's next wait: doubling from BACKOFF_FIRST_MS up to BACKOFF_CAP_MS, half of it random. */
  function backoff(origin: Origin): number {
    origin.refusals++;
    const full = Math.min(BACKOFF_CAP_MS, BACKOFF_FIRST_MS * 2 ** (origin.refusals - 1));
    return full / 2 + (random() * full) / 2;
  }

  /** Pauses `origin` after `response` refused a request: as long as it asks, or for the backoff. */
  function refused(origin: Origin, response: Response): void {
    origin.refusedAt = now();
    const asked = retryAfterMs(response.headers.get("Retry-After"), now());
    if (asked === undefined) pause(origin, backoff(origin));
    else {
      origin.refusals++;
      pause(origin, asked);
    }
  }

  /** Whether a request to `origin` that failed with `error` and no status counts as refused, pausing it if so. */
  function failedAsRefused(origin: Origin, error: unknown): boolean {
    if (!(error instanceof TypeError) || !online()) return false;
    const at = now();
    origin.failures = origin.failures.filter((failed) => at - failed < BURST_MS);
    origin.failures.push(at);
    const refusing =
      at < origin.until ||
      at - origin.refusedAt <= REFUSED_LATELY_MS ||
      origin.failures.length >= BURST_FAILURES;
    if (refusing) {
      origin.refusedAt = at;
      pause(origin, backoff(origin));
    }
    return refusing;
  }

  /** Waits while `origin` is paused: another request may pause it longer meanwhile. */
  async function turn(origin: Origin, signal: AbortSignal | undefined): Promise<void> {
    for (let left = origin.until - now(); left > 0; left = origin.until - now())
      await sleep(left, signal);
  }

  return {
    pace(fetch) {
      /**
       * One try: its wait waited, then the request sent, and its server
       * paused if it refused it. A failure comes back as its `error`,
       * with whether it counts as a refusal.
       */
      const send = async (
        origin: Origin,
        input: RequestInfo | URL,
        init: RequestInit | undefined,
        signal: AbortSignal | null | undefined,
      ): Promise<{ response: Response } | { error: unknown; refused: boolean }> => {
        await turn(origin, signal ?? undefined);
        try {
          const response = await fetch(input, init);
          if (isRefusal(response)) refused(origin, response);
          else origin.refusals = 0;
          return { response };
        } catch (error) {
          return { error, refused: !signal?.aborted && failedAsRefused(origin, error) };
        }
      };
      return async (input, init) => {
        const asked = requestOf(input, init);
        // Only a request to a server has an origin to pace; any other, such as a data: URL, goes on as it is.
        if (asked === undefined) return fetch(input, init);
        const { request, reads, signal, again } = asked;
        const origin = originOf(asked.url);
        const start = now();
        // Whether the request is past its tries, or its origin's wait ends past its time at the gate.
        const tooLong = (tries: number) =>
          !again || tries >= GATE_TRIES || origin.until - start > GATE_WAIT_MS;
        for (let tries = 1; ; tries++) {
          // Each try sends a copy, so a Request's body is there to send again.
          const sent = await send(origin, request?.clone() ?? input, init, signal);
          if ("error" in sent) {
            if (!sent.refused || !reads || tooLong(tries)) throw sent.error;
            continue;
          }
          const { response } = sent;
          if (!isRefusal(response) || (response.status === 503 && !reads)) return response;
          // The refusal's body is let go: the request is sent again, or fails.
          await response.body?.cancel().catch(() => undefined);
          if (tooLong(tries)) {
            const seconds = Math.ceil((origin.until - now()) / 1000);
            throw new AppError("podBusy", { host: origin.host, seconds });
          }
        }
      };
    },
  };
}

/**
 * What the gate reads of a request: its address, whether it only reads,
 * its signal, and whether its body can be sent again (one from a stream
 * can't); undefined for a request to no server, which has no origin.
 */
function requestOf(input: RequestInfo | URL, init: RequestInit | undefined) {
  const request = input instanceof Request ? input : undefined;
  const url = URL.parse(request?.url ?? String(input));
  if (url === null || url.origin === "null") return undefined;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  return {
    request,
    url,
    reads: READS.has(method),
    signal: init?.signal ?? request?.signal,
    again: !(init?.body instanceof ReadableStream),
  };
}

/** Whether `response` refuses its request for now: a 429, or a 503 that says how long to wait. */
function isRefusal({ status, headers }: Response): boolean {
  return status === 429 || (status === 503 && headers.has("Retry-After"));
}

/**
 * How long a Retry-After header asks to wait, in milliseconds, as
 * delta-seconds or an HTTP-date, never more than RETRY_AFTER_CAP_MS;
 * undefined when there is none, or none the browser shows (a response
 * without CORS headers that expose it), or it can't be read.
 */
export function retryAfterMs(value: string | null, now: number): number | undefined {
  if (value === null) return undefined;
  const text = value.trim();
  const ms = /^\d+$/.test(text) ? Number(text) * 1000 : Date.parse(text) - now;
  if (Number.isNaN(ms)) return undefined;
  return Math.min(Math.max(ms, 0), RETRY_AFTER_CAP_MS);
}

/** Settles after `ms`, or fails as `signal` says once it is aborted. */
function sleepFor(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const stop = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });
}
