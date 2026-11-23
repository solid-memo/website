// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError, type ErrorCode, type ErrorVars } from "@solid-memo/domain/appError";
import { HttpError, ReadLimitError, type ReadLimits } from "./client/interface";
import type { ReadsSpent } from "./client/readLimits";

/**
 * The messages between the page and a worker that reads documents the
 * app did not write (offPage.ts on the page, offPageServe.ts in the
 * worker; docs/validation.md, Off the page). The page sends a job, the
 * worker runs it, and every request the job makes goes back to the page,
 * which makes it with its own fetch and sends the answer's body back
 * whole: the worker never holds the user's login, and reads only.
 */

/** One end of the channel: the page's Worker, or the worker's own scope. */
export interface Port {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

/** Where the worker's shape validator reads the shapes, the vocabulary and the profiles (ShaclShapeValidatorDeps). */
export interface OffPageConfig {
  shapesBaseUrl: string;
  vocabBaseUrl: string;
  vendorBaseUrl: string;
}

/** A job for the worker: its name, its input, and the page's fetches it may make requests with, each by an id. */
export interface RunMessage {
  type: "run";
  job: string;
  input: unknown;
  config: OffPageConfig;
  /** The id of each fetch the job names, by its name in the job (offPageJobs.ts). */
  fetches: Record<string, number>;
  /** Whether the job's reads spend a budget of the page's (ReadBudget). */
  budget: boolean;
}

/** An answer the page got, its body read whole, with the limits it is read under and what was spent of them as it was. */
export interface SentResponse {
  url: string;
  status: number;
  statusText: string;
  redirected: boolean;
  headers: [string, string][];
  body: ArrayBuffer | null;
  /** The limits the page reads it under, and what was spent of them as it was (limitedFetch): none when it has none, or no body. */
  read?: { limits: ReadLimits; spent: ReadsSpent };
}

export type PageMessage =
  | RunMessage
  | { type: "response"; call: number; response: SentResponse }
  | { type: "rejected"; call: number; error: SentError }
  | { type: "budget"; call: number; event: "start" | "spent" };

export type WorkerMessage =
  | { type: "fetch"; call: number; fetch: number; url: string; init: SentInit }
  | { type: "abort"; call: number }
  | { type: "tally"; call: number; quads: number; characters: number }
  | { type: "spend"; call: number }
  | { type: "spendDone"; call: number }
  | { type: "done"; result: unknown; frozen: Path[] }
  | { type: "failed"; error: SentError };

/** The methods a request off the page may have: it only reads. The worker refuses any other, and so does the page. */
export const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/**
 * The request headers a read off the page may send, in lower case: what
 * the jobs' reads send (a type to read, the version a conditional read
 * names) and a part of a body. The page drops any other before it makes
 * the request: a login, a cookie or a proof is its own fetch's to add.
 */
export const READ_HEADERS: ReadonlySet<string> = new Set([
  "accept",
  "if-none-match",
  "if-modified-since",
  "range",
]);

/** What of a request's options goes to the page: a read's. */
export interface SentInit {
  method: string;
  headers: [string, string][];
  cache?: RequestCache;
  redirect?: RequestRedirect;
}

/**
 * An error as it is sent: of the kinds the app tells apart, each made
 * again on the other side as the same kind (fromSent). `ref` names one
 * the page sent, so that the page gets back the very object it sent.
 */
export type SentError = (
  | { kind: "app"; code: ErrorCode; vars: ErrorVars }
  | { kind: "limit"; url: string; limits: ReadLimits }
  | { kind: "http"; message: string; status: number }
  | { kind: "error"; name: string; message: string }
) & { ref?: number };

/** The kinds of Error a parser or a fetch fails with, made again as themselves. */
const ERRORS: Record<string, new (message: string) => Error> = {
  TypeError,
  SyntaxError,
  RangeError,
};

/** The error as it is sent (SentError); anything thrown that is no Error as a plain one. */
export function toSent(error: unknown, ref?: number): SentError {
  const sent = ((): SentError => {
    if (error instanceof AppError) return { kind: "app", code: error.code, vars: error.vars };
    if (error instanceof ReadLimitError)
      return { kind: "limit", url: error.url, limits: error.limits };
    if (error instanceof HttpError)
      return { kind: "http", message: error.message, status: error.statusCode };
    if (error instanceof Error) return { kind: "error", name: error.name, message: error.message };
    return { kind: "error", name: "Error", message: String(error) };
  })();
  return ref === undefined ? sent : { ...sent, ref };
}

/** The error a SentError stands for, made again (an HttpError with an answer of its status and no body). */
export function fromSent(sent: SentError): Error {
  switch (sent.kind) {
    case "app":
      return new AppError(sent.code, sent.vars);
    case "limit":
      return new ReadLimitError(sent.url, sent.limits);
    case "http":
      return new HttpError(sent.message, new Response(null, { status: sent.status }));
    case "error": {
      if (sent.name === "AbortError" || sent.name === "TimeoutError")
        return new DOMException(sent.message, sent.name);
      const Kind = ERRORS[sent.name];
      if (Kind !== undefined) return new Kind(sent.message);
      const error = new Error(sent.message);
      error.name = sent.name;
      return error;
    }
  }
}

/** The way from a result to one of its parts: the keys of the objects and the indexes of the arrays on it. */
export type Path = (string | number)[];

/**
 * The paths to the objects and arrays of `value` that are frozen, each
 * once: a message gives a copy of a result, none of it frozen, and the
 * app counts on some of what it reads being frozen (a course's outline,
 * domain/frozen.ts), so the page freezes them again (refreeze).
 */
export function frozenPaths(value: unknown): Path[] {
  const paths: Path[] = [];
  const seen = new Set<object>();
  const walk = (part: unknown, path: Path) => {
    if (typeof part !== "object" || part === null || seen.has(part)) return;
    seen.add(part);
    if (Object.isFrozen(part)) paths.push(path);
    if (!Array.isArray(part) && Object.getPrototypeOf(part) !== Object.prototype) return;
    for (const [key, inner] of Object.entries(part)) {
      walk(inner, [...path, Array.isArray(part) ? Number(key) : key]);
    }
  };
  walk(value, []);
  return paths;
}

/** `value` with the parts at `paths` frozen (frozenPaths). */
export function refreeze<T>(value: T, paths: readonly Path[]): T {
  for (const path of paths) {
    let part: unknown = value;
    for (const key of path) part = (part as Record<string | number, unknown>)[key];
    Object.freeze(part);
  }
  return value;
}
