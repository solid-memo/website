// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ReadBudget } from "@solid-memo/application/ports/checks";
import { limitedFetch, type ReadsSpent } from "@solid-memo/solid-client/readLimits";
import {
  frozenPaths,
  fromSent,
  type OffPageConfig,
  type PageMessage,
  type Port,
  READ_METHODS,
  type SentInit,
  type SentResponse,
  toSent,
  type WorkerMessage,
} from "./offPageProtocol";

/** What a job has of the page while it runs: its fetches by name, the page's budget for its reads, if any, and where the shapes are. */
export interface JobEnv {
  fetch(name: string): typeof globalThis.fetch;
  budget?: ReadBudget;
  config: OffPageConfig;
}

/** The jobs a worker runs, by name: each a function of its input (offPageJobs.ts). */
export type Jobs = Record<string, (env: JobEnv, input: never) => Promise<unknown>>;

/** How many of the page's fetches a worker keeps a bridged fetch of, the last asked for: a release from a link is read with a fetch of its own each time. */
const MAX_BRIDGED = 16;

/**
 * The worker's side of the channel (offPageProtocol.ts): it runs each
 * job the page sends, one at a time, and sends back its result, or what
 * it failed with. A job's requests are made by the page (`fetch` in
 * JobEnv), each with the page's fetch of the id the job names: the
 * answer comes back with its body whole, and is read here as a
 * response, under the limits the page reads it under (limitedFetch),
 * counting on from where the page puts it, so that it may take only the
 * room the page holds for it in its tally (holdRoom). What the job's
 * parses count of triples and their characters in that tally is sent
 * back to the page as the job ends, before its result, so that the
 * page's tally holds it as if it had parsed the answer itself. A
 * request that would write is refused here, before the page hears of it.
 */
export function serveOffPage(port: Port, jobs: Jobs): void {
  let calls = 0;
  const answers = new Map<number, (message: PageMessage) => void>();
  /**
   * How each request of the job still waiting for the page ends, a
   * fetch or a spend of the budget. Each ends as the job ends (abandon):
   * the page answers none after that, and a read waiting for ever on one
   * would be shared with the next job (datasets.ts).
   */
  const pending = new Map<number, (reason: unknown) => void>();
  /** The objects of errors the page sent, by the id it gave them, so that a job's failure sends that id back. */
  const refs = new WeakMap<object, number>();
  /**
   * The bridged fetches, one per id the page gives a fetch of its own,
   * kept while they are among the last asked for: what the adapters read
   * is kept by the fetch it was read with (datasets.ts), so a check reads
   * a document again on condition, as in the page.
   */
  const bridged = new Map<number, typeof globalThis.fetch>();
  /** The tallies of the answers this job read under limits, each with what was spent before its parse. */
  let tallies: { call: number; tally: ReadsSpent; start: ReadsSpent }[] = [];
  const send = (message: WorkerMessage) => port.postMessage(message);
  /** The error the page sent, made again, its id (the page names each it sends) noted. */
  const received = (sent: Extract<PageMessage, { type: "rejected" }>["error"]) => {
    const error = fromSent(sent);
    refs.set(error, sent.ref!);
    return error;
  };

  /** A request of the page's fetch `id`, answered as a response read under the page's limits. */
  const bridge =
    (id: number): typeof globalThis.fetch =>
    async (input, init) => {
      const request = input instanceof Request ? input : undefined;
      const url = request?.url ?? String(input);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      if (!READ_METHODS.has(method))
        throw new TypeError(`A read off the page only reads: ${method}`);
      const signal = init?.signal ?? request?.signal;
      signal?.throwIfAborted();
      const sentInit: SentInit = {
        method,
        headers: [...new Headers(init?.headers ?? request?.headers)],
        ...(init?.cache === undefined ? {} : { cache: init.cache }),
        ...(init?.redirect === undefined ? {} : { redirect: init.redirect }),
      };
      const call = ++calls;
      const answer = new Promise<SentResponse>((resolve, reject) => {
        pending.set(call, (reason) => {
          answers.delete(call);
          pending.delete(call);
          reject(reason);
        });
        answers.set(call, (message) => {
          answers.delete(call);
          pending.delete(call);
          if (message.type === "response") resolve(message.response);
          else reject(received((message as Extract<PageMessage, { type: "rejected" }>).error));
        });
        signal?.addEventListener(
          "abort",
          () => {
            if (!answers.delete(call)) return;
            pending.delete(call);
            send({ type: "abort", call });
            reject(signal.reason);
          },
          { once: true },
        );
      });
      send({ type: "fetch", call, fetch: id, url, init: sentInit });
      const sent = await answer;
      const response = new Response(sent.body, {
        status: sent.status,
        statusText: sent.statusText,
        headers: sent.headers,
      });
      Object.defineProperty(response, "url", { value: sent.url });
      Object.defineProperty(response, "redirected", { value: sent.redirected });
      if (sent.read === undefined) return response;
      // Counted again from what was spent before its body, so that the tally reads as the page's did.
      const { limits, spent } = sent.read;
      const tally = { ...spent, bytes: spent.bytes - sent.body!.byteLength };
      tallies.push({ call, tally, start: { ...spent } });
      return limitedFetch(async () => response, limits, tally)(sent.url);
    };

  /** The bridged fetch of the page's fetch `id`, the same each time while it is among the last MAX_BRIDGED asked for. */
  const fetchOf = (id: number) => {
    const fetch = bridged.get(id) ?? bridge(id);
    bridged.delete(id);
    bridged.set(id, fetch);
    for (const [oldest] of bridged) {
      if (bridged.size <= MAX_BRIDGED) break;
      bridged.delete(oldest);
    }
    return fetch;
  };

  /** The page's budget, spent as the page spends it (ReadBudget): the read starts once the page says it may. */
  const budget: ReadBudget = {
    spend(otherwise, read) {
      const call = ++calls;
      return new Promise((resolve, reject) => {
        // The job has ended: its budget is as good as spent, and the page waits for no read of it.
        pending.set(call, () => {
          answers.delete(call);
          pending.delete(call);
          resolve(otherwise);
        });
        answers.set(call, (message) => {
          if ((message as Extract<PageMessage, { type: "budget" }>).event === "spent") {
            answers.delete(call);
            pending.delete(call);
            resolve(otherwise);
            return;
          }
          read().then(
            (value) => {
              if (!answers.delete(call)) return;
              pending.delete(call);
              send({ type: "spendDone", call });
              resolve(value);
            },
            (error: unknown) => {
              if (!answers.delete(call)) return;
              pending.delete(call);
              send({ type: "spendDone", call });
              reject(error);
            },
          );
        });
        send({ type: "spend", call });
      });
    },
  };

  port.addEventListener("message", (event) => {
    const message = event.data as PageMessage;
    if (message.type !== "run") {
      answers.get(message.call)?.(message);
      return;
    }
    tallies = [];
    const env: JobEnv = {
      fetch: (name) => {
        const id = message.fetches[name];
        if (id === undefined) throw new TypeError(`The job has no fetch named ${name}`);
        return fetchOf(id);
      },
      ...(message.budget ? { budget } : {}),
      config: message.config,
    };
    const job = jobs[message.job];
    const result =
      job === undefined
        ? Promise.reject(new TypeError(`No job named ${message.job}`))
        : Promise.resolve().then(() => job(env, message.input as never));
    void result.then(
      (value) => {
        sendTallies();
        send({ type: "done", result: value, frozen: frozenPaths(value) });
        abandon();
      },
      (error: unknown) => {
        sendTallies();
        const ref = typeof error === "object" && error !== null ? refs.get(error) : undefined;
        send({ type: "failed", error: toSent(error, ref) });
        abandon();
      },
    );
  });

  /** The requests the job left waiting as it ended, each ended: a fetch fails as aborted, as the page has stopped it (offPage.ts settle), and a spend gives what it gives when the budget is spent. */
  function abandon(): void {
    for (const fail of [...pending.values()])
      fail(new DOMException("The job that made this request has ended", "AbortError"));
  }

  /** What the job's parses counted in each tally, sent to the page. */
  function sendTallies(): void {
    for (const { call, tally, start } of tallies) {
      send({
        type: "tally",
        call,
        quads: tally.quads - start.quads,
        characters: tally.characters - start.characters,
      });
    }
    tallies = [];
  }
}
