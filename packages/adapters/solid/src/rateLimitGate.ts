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

import type { PodWaits } from "@solid-memo/application/ports/pod";
import { AppError } from "@solid-memo/domain/appError";

/** Methods that only read; every other one writes. */
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/** The schemes of the addresses the gate paces: those sent to a server. */
const PACED = new Set(["http:", "https:"]);

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
 * How long after a server refused a request with a status (429, or 503
 * with Retry-After) a request to it that fails with no status at all
 * counts as refused too, in milliseconds, or as long as the wait it
 * asked for lasts, if longer: a proxy may send its 429s without CORS
 * headers, which the browser shows as a network failure. A failure with
 * no status from a server that sent no such status lately is no refusal:
 * an address the browser refuses to send, or one a front end turns away
 * without CORS headers, fails that way too, and must not pause the
 * server's other requests.
 */
export const REFUSED_LATELY_MS = 60_000;

/**
 * How many requests the gate lets go to one server at once, for a fetch
 * it paces with `limited`: as many as a browser asks one server for over
 * HTTP/1.1 (READS_AT_ONCE in the application). Over HTTP/2 a browser
 * sends a page's requests together, and a server that rate-limits takes
 * them as a burst.
 */
export const REQUESTS_AT_ONCE = 6;

/**
 * How long a limited request holds its server's turn at most, in
 * milliseconds: one the server is slow to answer goes on, not aborted,
 * but holds up only itself after that. A write has no deadline, so
 * without it a few writes that are never answered would hold every
 * turn for good.
 */
export const TURN_MS = 30_000;

/** What the gate keeps of one origin. */
interface Origin {
  /** The host, as the learner sees it. */
  host: string;
  /** The time no request is sent before, in milliseconds since the epoch; 0 when none. */
  until: number;
  /** Whether the server refused with a status for the wait now, not only failed with none (PodWait). */
  asked: boolean;
  /** The refusals in a row, which the backoff grows with; a response that isn't one starts it again. */
  refusals: number;
  /**
   * Until when a request to it that fails with no status counts as
   * refused, in milliseconds since the epoch: REFUSED_LATELY_MS after
   * its last refusal with a status, or the end of the wait that refusal
   * asked for, if later; 0 when it never refused with one. A failure
   * counted as a refusal leaves it as it is.
   */
  lately: number;
  /** How many limited requests to it are under way. */
  running: number;
  /** The limited requests waiting for one under way to end, in the order they came. */
  waiting: (() => void)[];
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
  /** How many limited requests go to one server at once. */
  atOnce?: number;
}

/**
 * The gate: `pace` wraps a fetch, its requests passing the gate, every
 * wrapped fetch sharing its waits; with `limited`, its requests share
 * each server's turns too, `atOnce` of them under way at most. As the
 * PodWaits port, it says which servers' waits last, for the learner to
 * be told.
 */
export interface RateLimitGate extends PodWaits {
  pace(fetch: typeof globalThis.fetch, options?: { limited?: boolean }): typeof globalThis.fetch;
}

/**
 * A gate with one wait per origin, which every fetch it paces shares.
 * A request waits while its origin is paused, then is sent. Refused with
 * 429, whatever its method, or with 503 and Retry-After when it only
 * reads, it is sent again after the wait: the server didn't act on it.
 * A write refused with 503 pauses the origin, and its answer is passed
 * on as it is, as the server may have acted on it. A request that fails
 * with no status (a TypeError) counts as refused only lately after its
 * server refused one with a status: within REFUSED_LATELY_MS of that
 * refusal, or while the wait it asked for lasts, and only while the
 * browser is online; a read is then sent again, and a write's failure is
 * passed on. Any other such failure is that request's alone. Past
 * GATE_TRIES, or when the next try would come after GATE_WAIT_MS, it
 * fails: with podBusy when the server refused it with a status, with its
 * last failure otherwise, as a server that sends no status may be down
 * instead. A request whose wait at the gate, its first try's too, would
 * end after GATE_WAIT_MS fails with podBusy. A request aborted while it
 * waits fails as its signal says.
 *
 * A limited request takes a turn of its server's after its wait, and
 * gives it up once its answer's headers come or it fails, before any
 * next try, or after TURN_MS while it is still under way: its body is
 * read in no turn, so a caller that keeps a body unread holds up no
 * other request, and a server that never answers holds a turn no
 * longer than that. A turn is held only while the fetch paced is under
 * way, so that fetch must make no limited request to the same server on
 * its way, or it would wait on it.
 */
export function createRateLimitGate({
  now = () => Date.now(),
  random = () => Math.random(),
  sleep = sleepFor,
  online = () => globalThis.navigator?.onLine !== false,
  atOnce = REQUESTS_AT_ONCE,
}: GateOptions = {}): RateLimitGate {
  const origins = new Map<string, Origin>();
  const listeners = new Set<() => void>();

  function originOf(url: URL): Origin {
    let origin = origins.get(url.origin);
    if (origin === undefined) {
      origin = {
        host: url.host,
        until: 0,
        asked: false,
        refusals: 0,
        lately: 0,
        running: 0,
        waiting: [],
      };
      origins.set(url.origin, origin);
    }
    return origin;
  }

  /** Pauses `origin` for `ms` from now, unless it is paused longer already, telling the listeners when it is paused longer. */
  function pause(origin: Origin, ms: number): void {
    const until = now() + ms;
    if (until <= origin.until) return;
    origin.until = until;
    for (const listener of listeners) listener();
  }

  /** The backoff's next wait: doubling from BACKOFF_FIRST_MS up to BACKOFF_CAP_MS, half of it random. */
  function backoff(origin: Origin): number {
    origin.refusals++;
    const full = Math.min(BACKOFF_CAP_MS, BACKOFF_FIRST_MS * 2 ** (origin.refusals - 1));
    return full / 2 + (random() * full) / 2;
  }

  /** Pauses `origin` after `response` refused a request: as long as it asks, or for the backoff. */
  function refused(origin: Origin, response: Response): void {
    const at = now();
    origin.asked = true;
    const asked = retryAfterMs(response.headers.get("Retry-After"), at);
    let wait: number;
    if (asked === undefined) wait = backoff(origin);
    else {
      origin.refusals++;
      wait = asked;
    }
    origin.lately = Math.max(origin.lately, at + Math.max(wait, REFUSED_LATELY_MS));
    pause(origin, wait);
  }

  /**
   * Whether a request to `origin` that failed with `error` and no status
   * counts as refused, pausing it if so: only while the browser is online,
   * and only lately after the server refused a request with a status
   * (Origin.lately).
   */
  function failedAsRefused(origin: Origin, error: unknown): boolean {
    const at = now();
    if (!(error instanceof TypeError) || !online() || at >= origin.lately) return false;
    // A wait the server asked for stays one it asked for, though a failure makes it longer.
    if (at >= origin.until) origin.asked = false;
    pause(origin, backoff(origin));
    return true;
  }

  /** The failure of a request to `origin` held at the gate too long: podBusy, with the seconds its wait has left. */
  function busy(origin: Origin): AppError {
    const seconds = Math.ceil((origin.until - now()) / 1000);
    return new AppError("podBusy", { host: origin.host, seconds });
  }

  /**
   * Waits while `origin` is paused: another request may pause it longer
   * meanwhile. Fails with podBusy, without waiting, once the wait would
   * end more than GATE_WAIT_MS after `start`, when the request reached
   * the gate, its first try's wait as much as any other's.
   */
  async function turn(
    origin: Origin,
    signal: AbortSignal | undefined,
    start: number,
  ): Promise<void> {
    for (let left = origin.until - now(); left > 0; left = origin.until - now()) {
      if (origin.until - start > GATE_WAIT_MS) throw busy(origin);
      await sleep(left, signal);
    }
  }

  /**
   * Waits for one of `origin`'s turns, `atOnce` at most under way, and
   * then while it is paused, giving the turn up meanwhile; fails as
   * `signal` says once it is aborted, or as turn says once the wait
   * would end too long after `start`.
   */
  async function take(
    origin: Origin,
    signal: AbortSignal | undefined,
    start: number,
  ): Promise<void> {
    for (;;) {
      await turn(origin, signal, start);
      if (origin.running < atOnce) origin.running++;
      else await queued(origin, signal);
      // Paused while it waited: the turn goes to the next, and the wait is waited.
      if (origin.until <= now()) return;
      give(origin);
    }
  }

  /** Settles once a turn of `origin`'s is handed over, or fails as `signal` says, leaving the line. */
  function queued(origin: Origin, signal: AbortSignal | undefined): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const start = () => {
        signal?.removeEventListener("abort", leave);
        resolve();
      };
      const leave = () => {
        origin.waiting.splice(origin.waiting.indexOf(start), 1);
        reject(signal?.reason);
      };
      origin.waiting.push(start);
      signal?.addEventListener("abort", leave, { once: true });
    });
  }

  /** Gives a turn of `origin`'s up: to the first waiting for one, if any. */
  function give(origin: Origin): void {
    const next = origin.waiting.shift();
    if (next === undefined) origin.running--;
    else next();
  }

  /**
   * The turn of `origin`'s just taken, given up after TURN_MS: a
   * function that gives it up sooner, once the request settles. The
   * turn is given up once, whichever comes first.
   */
  function held(origin: Origin): () => void {
    let given = false;
    const giveUp = () => {
      if (given) return;
      given = true;
      clearTimeout(timer);
      give(origin);
    };
    const timer = setTimeout(giveUp, TURN_MS);
    return giveUp;
  }

  return {
    current() {
      const at = now();
      return [...origins.values()]
        .filter(({ until }) => until > at)
        .sort((a, b) => a.until - b.until)
        .map(({ host, until, asked }) => ({ host, until: new Date(until), asked }));
    },
    listen(listener) {
      // Each listening is its own, though the same function listens twice.
      const own = () => listener();
      listeners.add(own);
      return () => listeners.delete(own);
    },
    pace(fetch, { limited = false } = {}) {
      /**
       * One try: its turn waited for, then the request sent, and its
       * server paused if it refused it, before the turn is given up, so
       * the next in line finds the server paused. A failure comes back as
       * its `error`, with whether it counts as a refusal.
       */
      const send = async (
        origin: Origin,
        input: RequestInfo | URL,
        init: RequestInit | undefined,
        signal: AbortSignal | null | undefined,
        start: number,
      ): Promise<{ response: Response } | { error: unknown; refused: boolean }> => {
        let release = () => {};
        if (limited) {
          await take(origin, signal ?? undefined, start);
          release = held(origin);
        } else await turn(origin, signal ?? undefined, start);
        try {
          const response = await fetch(input, init);
          if (isRefusal(response)) refused(origin, response);
          else origin.refusals = 0;
          return { response };
        } catch (error) {
          return { error, refused: !signal?.aborted && failedAsRefused(origin, error) };
        } finally {
          release();
        }
      };
      return async (input, init) => {
        const asked = requestOf(input, init);
        // Only an http: or https: request to a server has an origin to pace; any other, such as a
        // data: or blob: URL, or one the browser refuses to send (with a user name or password),
        // goes on as it is.
        if (asked === undefined) return fetch(input, init);
        const { request, reads, signal, again } = asked;
        const origin = originOf(asked.url);
        const start = now();
        // Whether the request is past its tries, or its origin's wait ends past its time at the gate.
        const tooLong = (tries: number) =>
          !again || tries >= GATE_TRIES || origin.until - start > GATE_WAIT_MS;
        for (let tries = 1; ; tries++) {
          // Each try sends a copy, so a Request's body is there to send again.
          const sent = await send(origin, request?.clone() ?? input, init, signal, start);
          if ("error" in sent) {
            if (!sent.refused || !reads || tooLong(tries)) throw sent.error;
            continue;
          }
          const { response } = sent;
          if (!isRefusal(response) || (response.status === 503 && !reads)) return response;
          // The refusal's body is let go: the request is sent again, or fails.
          await response.body?.cancel().catch(() => undefined);
          if (tooLong(tries)) throw busy(origin);
        }
      };
    },
  };
}

/**
 * What the gate reads of a request: its address, whether it only reads,
 * its signal, and whether its body can be sent again (one from a stream
 * can't); undefined for any address but an http: or https: one (a blob:
 * URL's origin is that of the page that made it, not of a server it was
 * sent to), and for one with a user name or password, which the browser
 * refuses to send, so its failure is that request's alone and no server's.
 */
function requestOf(input: RequestInfo | URL, init: RequestInit | undefined) {
  const request = input instanceof Request ? input : undefined;
  const url = URL.parse(request?.url ?? String(input));
  if (url === null || !PACED.has(url.protocol) || url.username !== "" || url.password !== "")
    return undefined;
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
