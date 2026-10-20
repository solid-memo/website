// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

// @vitest-environment happy-dom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
 * What the journeys job publishes in place of the report's trace viewer
 * (report/trace/, docs/deployment.md#the-journeys-report): a page that
 * sends the report's own traces on to trace.playwright.dev, and a service
 * worker that unregisters the viewer's.
 */

const TRACE = resolve(import.meta.dirname, "../report/trace");
const html = readFileSync(resolve(TRACE, "index.html"), "utf8");
// Read as a browser reads it, so no script, however it is written, goes unseen.
const page = new DOMParser().parseFromString(html, "text/html");
const scripts = [...page.scripts].map((script) => script.text);

/** Where the page, opened at `href`, sends the visitor, if anywhere. */
function forward(href: string): string | undefined {
  const url = new URL(href);
  let target: string | undefined;
  new Function("location", scripts[0]!)({
    href: url.href,
    search: url.search,
    replace: (to: string) => (target = to),
  });
  return target;
}

const REPORT = "https://journeys.solid-memo.com/";

/** Traces' names, as the report names them: the file's SHA-1, then .zip. */
const A = "b81606b571811bafffeb394059a1e0048b4151da.zip";
const B = "0a1b2c3d4e5f60718293a4b5c6d7e8f901234567.zip";

/** The page opened with these `trace` parameters, as the report's Trace link opens it. */
function open(...traces: string[]): string | undefined {
  const query = traces.map((trace) => `trace=${encodeURIComponent(trace)}`).join("&");
  return forward(`${REPORT}trace/index.html?${query}`);
}

/** Where trace.playwright.dev is sent, to open these traces. */
function viewer(...traces: string[]): string {
  return `https://trace.playwright.dev/?${traces.map((trace) => `trace=${encodeURIComponent(trace)}`).join("&")}`;
}

describe("the report's trace page", () => {
  it("sends a trace of the report's own on to trace.playwright.dev", () => {
    expect(open(`${REPORT}data/${A}`)).toBe(viewer(`${REPORT}data/${A}`));
  });

  it("sends every trace of a journey with more than one", () => {
    expect(open(`${REPORT}data/${A}`, `${REPORT}data/${B}`)).toBe(
      viewer(`${REPORT}data/${A}`, `${REPORT}data/${B}`),
    );
  });

  it("reads a trace given relative to the page", () => {
    expect(open(`../data/${A}`)).toBe(viewer(`${REPORT}data/${A}`));
  });

  it("looks under the folder the report is served from", () => {
    const site = "https://example.github.io/journeys/";
    expect(forward(`${site}trace/index.html?trace=${site}data/${A}`)).toBe(
      viewer(`${site}data/${A}`),
    );
    expect(
      forward(`${site}trace/index.html?trace=https://example.github.io/other/data/${A}`),
    ).toBeUndefined();
  });

  it.each([
    ["another site's", `https://attacker.example/data/${A}`],
    ["a subdomain's", `https://evil.journeys.solid-memo.com/data/${A}`],
    ["plain http's", `http://journeys.solid-memo.com/data/${A}`],
    ["one with a name in it", `https://user@journeys.solid-memo.com/data/${A}`],
    ["one outside data/", `${REPORT}trace/${A}`],
    ["one in a folder of data/", `${REPORT}data/x/${A}`],
    ["one that climbs out of data/", `${REPORT}data/../${A}`],
    ["one that climbs out of data/, escaped", `${REPORT}data/%2e%2e/${A}`],
    ["one whose escaped slash Pages would read as a folder", `${REPORT}data/..%2Findex.html`],
    ["one not named as the report names a trace", `${REPORT}data/index.html`],
    ["one with a query", `${REPORT}data/${A}?x=1`],
    ["one with a fragment", `${REPORT}data/${A}#x`],
    ["a blob's", `blob:${REPORT}0a1b2c`],
    ["a data URL's", "data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=="],
    ["a script's", "javascript:alert(1)"],
    ["no address at all", "http://["],
  ])("stays put for %s trace", (_, trace) => {
    expect(open(trace)).toBeUndefined();
  });

  it("stays put when any one of its traces is not the report's", () => {
    expect(open(`${REPORT}data/${A}`, `https://attacker.example/data/${B}`)).toBeUndefined();
  });

  it("stays put with no trace", () => {
    expect(forward(`${REPORT}trace/index.html`)).toBeUndefined();
  });

  it("lets its one script run by its hash, and nothing else load", () => {
    const meta = page.querySelector('meta[http-equiv="Content-Security-Policy"]')!;
    expect(
      meta.compareDocumentPosition(page.scripts[0]!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const policy = new Map(
      meta
        .getAttribute("content")!
        .split(";")
        .map((part) => {
          const [name, ...values] = part.trim().split(/\s+/);
          return [name!, values];
        }),
    );
    expect(scripts).toHaveLength(1);
    expect(policy.get("default-src")).toEqual(["'none'"]);
    expect(policy.get("script-src")).toEqual([
      `'sha256-${createHash("sha256").update(scripts[0]!).digest("base64")}'`,
    ]);
    expect(policy.get("base-uri")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'none'"]);
  });
});

/** The worker's listeners, run against a stand-in for its global scope. */
function worker(clients: { url: string; navigate: (url: string) => Promise<unknown> }[]) {
  const listeners = new Map<string, (event: unknown) => void>();
  const scope = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
    skipWaiting: vi.fn(async () => {}),
    registration: { unregister: vi.fn(async () => true) },
    clients: { matchAll: vi.fn(async () => clients) },
  };
  new Function("self", readFileSync(resolve(TRACE, "sw.bundle.js"), "utf8"))(scope);
  return { scope, listeners };
}

describe("the report's trace worker", () => {
  it("takes over from the viewer's worker as soon as it is installed", () => {
    const { scope, listeners } = worker([]);
    listeners.get("install")!({});
    expect(scope.skipWaiting).toHaveBeenCalledOnce();
  });

  it("unregisters itself, then reloads the pages it controlled", async () => {
    const page = { url: `${REPORT}trace/index.html`, navigate: vi.fn(async () => null) };
    const { scope, listeners } = worker([page]);
    let done: Promise<unknown> | undefined;
    listeners.get("activate")!({ waitUntil: (promise: Promise<unknown>) => (done = promise) });
    await done;
    expect(scope.registration.unregister).toHaveBeenCalledOnce();
    expect(scope.clients.matchAll).toHaveBeenCalledWith({ type: "window" });
    expect(page.navigate).toHaveBeenCalledWith(page.url);
    expect(scope.registration.unregister.mock.invocationCallOrder[0]).toBeLessThan(
      page.navigate.mock.invocationCallOrder[0]!,
    );
  });

  it("still finishes when a page will not reload", async () => {
    const page = {
      url: `${REPORT}trace/index.html`,
      navigate: vi.fn(async () => {
        throw new TypeError("not a window client of this worker");
      }),
    };
    const { listeners } = worker([page]);
    let done: Promise<unknown> | undefined;
    listeners.get("activate")!({ waitUntil: (promise: Promise<unknown>) => (done = promise) });
    await expect(done).resolves.toBeDefined();
  });

  it("answers no request, so every request goes to the site", () => {
    expect(worker([]).listeners.has("fetch")).toBe(false);
  });
});
