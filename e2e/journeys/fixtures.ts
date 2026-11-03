// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  test as base,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createAccount, type CssAccount } from "./harness/cssAccount.ts";
import { CSS_LOG } from "./harness/cssServer.ts";
import { otherApp, type OtherApp } from "./harness/otherApp.ts";
import { loggedByWebKit } from "./harness/pageErrors.ts";
import { beat, heartbeats, type Stalls } from "./harness/heartbeat.ts";
import { dumpPod } from "./harness/podDump.ts";
import { seedRandom } from "./harness/seededRandom.ts";
import { App } from "./pages/App.ts";

/**
 * What every journey gets (docs/testing.md):
 *
 * - `server`, the Solid server's root (globalSetup.ts);
 * - `runId`, eight hex digits naming what this run makes (decks, pods);
 * - `account`, a fresh account, pod and WebID on it; when the journey
 *   fails, its pod's content is attached (pod-dump.ttl);
 * - `otherApp`, an app other than Solid Memo writing to that pod for the
 *   WebID (harness/otherApp.ts);
 * - `app`, the page objects (pages/App.ts), journey steps among them;
 * - `newDevice`, which opens the app again in a browser of its own (a
 *   new context: no cookies, no storage), as on a second device, and
 *   gives its page objects; in another time zone, given its `timezoneId`.
 *   It gets all the below, as `app` does.
 *
 * And, unasked: Math.random seeded (JOURNEY_SEED, else from the title and
 * the repeat),
 * requests to any host but 127.0.0.1 refused, flags stubbed, dialogs
 * answered only as a step expects, and diagnostics.json (console, page
 * errors, failed requests, each page's crash or close and the times it
 * went quiet, harness/heartbeat.ts) attached, plus, when the journey
 * fails, the server's log for its time. An error thrown in the page fails
 * the journey.
 */
interface Fixtures {
  server: string;
  runId: string;
  account: CssAccount;
  otherApp: OtherApp;
  app: App;
  newDevice: (options?: { timezoneId?: string }) => Promise<App>;
  diagnostics: Diagnostics;
}

export interface Diagnostics extends Stalls {
  seed: number;
  timezone: string | undefined;
  console: { type: string; text: string; url?: string }[];
  pageErrors: string[];
  failedRequests: { method: string; url: string; failure: string }[];
  errorResponses: { method: string; url: string; status: number }[];
  blockedRequests: string[];
  unexpectedDialogs: string[];
  /** A page that crashed or closed during the journey, and when (the test's clock). */
  pageEvents: { page: string; event: "crash" | "close"; at: string }[];
}

/** Each journey's heartbeats (harness/heartbeat.ts), by its diagnostics. */
const pulses = new WeakMap<Diagnostics, ReturnType<typeof heartbeats>>();
/** The page's name for its heartbeat's binding. */
const HEARTBEAT = "__journeyHeartbeat";

/** What diagnostics.json calls each page: the journey's own, or a device's (newDevice). */
const pageNames = new WeakMap<Page, string>();

const seedOf = (title: string) => {
  const given = Number(process.env.JOURNEY_SEED);
  if (Number.isInteger(given) && given > 0) return given;
  let hash = 2166136261;
  for (const char of title) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash;
};

export const test = base.extend<Fixtures>({
  server: async ({}, use) => {
    const url = process.env.JOURNEY_CSS_URL;
    if (url === undefined) throw new Error("No Solid server: globalSetup.ts sets JOURNEY_CSS_URL.");
    await use(url);
  },

  runId: async ({}, use, testInfo) => {
    const id = randomUUID().replace(/-/g, "").slice(0, 8);
    testInfo.annotations.push({ type: "runId", description: id });
    await use(id);
  },

  // After diagnostics in setup, so before it in teardown: it sees what diagnostics will fail the journey on.
  account: async ({ server, runId, playwright, diagnostics }, use, testInfo) => {
    // Not the browser's request context: its cookie would log the browser in.
    const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });
    try {
      const account = await createAccount(api, server, runId);
      testInfo.annotations.push(
        { type: "webId", description: account.webId },
        { type: "pod", description: account.pod },
      );
      await use(account);
      if (testInfo.status !== testInfo.expectedStatus || failsOn(diagnostics)) {
        const dump = await dumpPod(api, server, account).catch(
          (error: Error) => `# The pod could not be read: ${error.message}`,
        );
        await testInfo.attach("pod-dump.ttl", { body: dump, contentType: "text/turtle" });
      }
    } finally {
      await api.dispose();
    }
  },

  otherApp: async ({ server, account, playwright }, use) => {
    const api = await playwright.request.newContext({ ignoreHTTPSErrors: true });
    try {
      await use(otherApp(api, server, account));
    } finally {
      await api.dispose();
    }
  },

  diagnostics: [
    async ({ page, context }, use, testInfo) => {
      // A repeat (--repeat-each) shuffles otherwise; the seed in the report replays any of them.
      const seed = seedOf(`${testInfo.titlePath.join(" › ")}#${testInfo.repeatEachIndex}`);
      const found: Diagnostics = {
        seed,
        timezone: testInfo.project.use.timezoneId,
        console: [],
        pageErrors: [],
        failedRequests: [],
        errorResponses: [],
        blockedRequests: [],
        unexpectedDialogs: [],
        pageEvents: [],
        silences: [],
        stills: [],
      };
      pulses.set(found, heartbeats(found));
      testInfo.annotations.push({ type: "seed", description: String(seed) });
      await instrument(context, found);
      watch(page, found, "page");
      const started = new Date();
      await use(found);
      pulses.get(found)!.end(Date.now());
      await testInfo.attach("diagnostics.json", {
        body: JSON.stringify(found, null, 2),
        contentType: "application/json",
      });
      if (testInfo.status !== testInfo.expectedStatus || failsOn(found)) {
        await attachServerLog(testInfo, started, new Date());
      }
      expect.soft(found.pageErrors, "errors thrown in the page (diagnostics.json)").toEqual([]);
      expect
        .soft(found.blockedRequests, "requests to hosts other than 127.0.0.1 (diagnostics.json)")
        .toEqual([]);
      expect.soft(found.unexpectedDialogs, "dialogs no step expected").toEqual([]);
    },
    { auto: true },
  ],

  app: async ({ page, diagnostics }, use, testInfo) => {
    await use(new App(page, testInfo, diagnostics));
  },

  newDevice: async ({ browser, diagnostics }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async (options) => {
      // A test's browser.newContext takes the project's options (use), as the fixture's own context does.
      const context = await browser.newContext(options);
      contexts.push(context);
      await instrument(context, diagnostics);
      const page = await context.newPage();
      watch(page, diagnostics, `device ${contexts.length}`);
      return new App(page, testInfo, diagnostics);
    });
    for (const context of contexts) await context.close();
  },
});

export { expect };

/**
 * What every context gets: Math.random seeded, requests to any host
 * but 127.0.0.1 refused, and each page's heartbeat.
 */
async function instrument(context: BrowserContext, found: Diagnostics): Promise<void> {
  await context.addInitScript(seedRandom, found.seed);
  await context.exposeBinding(HEARTBEAT, ({ page }, frames: number) =>
    pulses.get(found)!.beat(pageNames.get(page) ?? page.url(), frames, Date.now()),
  );
  await context.addInitScript(beat, HEARTBEAT);
  // Routing every request turns Chromium's HTTP cache off: the app loads everything afresh, as on a first visit.
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1") return route.fallback();
    found.blockedRequests.push(url.href);
    return route.abort("blockedbyclient");
  });
}

/**
 * What every page reports to diagnostics.json, under `name`: its console,
 * its errors, its failed requests, and whether it crashed or closed.
 */
function watch(page: Page, found: Diagnostics, name: string): void {
  pageNames.set(page, name);
  page.on("crash", () =>
    found.pageEvents.push({ page: name, event: "crash", at: new Date().toISOString() }),
  );
  page.on("close", () => {
    found.pageEvents.push({ page: name, event: "close", at: new Date().toISOString() });
    pulses.get(found)!.close(name, Date.now());
  });
  page.on("console", (message) =>
    found.console.push({
      type: message.type(),
      text: message.text(),
      url: message.location().url || undefined,
    }),
  );
  page.on("pageerror", (error) => {
    const stack = error.stack ?? String(error);
    if (loggedByWebKit(stack)) found.console.push({ type: "error", text: stack });
    else found.pageErrors.push(stack);
  });
  page.on("requestfailed", (request) =>
    found.failedRequests.push({
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText ?? "",
    }),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      found.errorResponses.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
      });
  });
}

/** Whether the journey fails on what diagnostics found, though its steps passed. */
const failsOn = (found: Diagnostics) =>
  found.pageErrors.length + found.blockedRequests.length + found.unexpectedDialogs.length > 0;

/** The Solid server's log lines from the journey's time (logs/css.log has a timestamp on each). */
async function attachServerLog(testInfo: TestInfo, from: Date, to: Date): Promise<void> {
  // docker compose logs writes it a moment after the server prints.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const log = await readFile(CSS_LOG, "utf8").catch(() => undefined);
  if (log === undefined) return;
  const stamp = /^\S+\s+\|\s+(\d{4}-\d\d-\d\dT[\d:.]+Z)/;
  const lines = log.split("\n").filter((line) => {
    const at = stamp.exec(line)?.[1];
    if (at === undefined) return false;
    const time = Date.parse(at);
    return time >= from.getTime() - 1_000 && time <= to.getTime() + 1_000;
  });
  const note = `# The Solid server's log from ${from.toISOString()} to ${to.toISOString()}: every journey running then, this one among them.`;
  await testInfo.attach("css.log", {
    body: [note, ...lines].join("\n"),
    contentType: "text/plain",
  });
}

export type { Page };
