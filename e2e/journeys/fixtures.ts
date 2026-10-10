import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";
import { createAccount, type CssAccount } from "./harness/cssAccount.ts";
import { CSS_LOG } from "./harness/cssServer.ts";
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
 * - `app`, the page objects (pages/App.ts), journey steps among them.
 *
 * And, unasked: Math.random seeded (JOURNEY_SEED, else from the title and
 * the repeat),
 * requests to any host but 127.0.0.1 refused, flags stubbed, dialogs
 * answered only as a step expects, and diagnostics.json (console, page
 * errors, failed requests) plus the server's log for the journey's time
 * attached. An error thrown in the page fails the journey.
 */
interface Fixtures {
  server: string;
  runId: string;
  account: CssAccount;
  app: App;
  diagnostics: Diagnostics;
}

export interface Diagnostics {
  seed: number;
  timezone: string | undefined;
  console: { type: string; text: string; url?: string }[];
  pageErrors: string[];
  failedRequests: { method: string; url: string; failure: string }[];
  errorResponses: { method: string; url: string; status: number }[];
  blockedRequests: string[];
  unexpectedDialogs: string[];
}

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
      testInfo.annotations.push({ type: "webId", description: account.webId }, { type: "pod", description: account.pod });
      await use(account);
      if (testInfo.status !== testInfo.expectedStatus || failsOn(diagnostics)) {
        const dump = await dumpPod(api, server, account).catch((error: Error) => `# The pod could not be read: ${error.message}`);
        await testInfo.attach("pod-dump.ttl", { body: dump, contentType: "text/turtle" });
      }
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
      };
      testInfo.annotations.push({ type: "seed", description: String(seed) });
      await context.addInitScript(seedRandom, seed);
      // Routing every request turns Chromium's HTTP cache off: the app loads everything afresh, as on a first visit.
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "127.0.0.1") return route.fallback();
        found.blockedRequests.push(url.href);
        return route.abort("blockedbyclient");
      });
      page.on("console", (message) => found.console.push({ type: message.type(), text: message.text(), url: message.location().url || undefined }));
      page.on("pageerror", (error) => found.pageErrors.push(error.stack ?? String(error)));
      page.on("requestfailed", (request) =>
        found.failedRequests.push({ method: request.method(), url: request.url(), failure: request.failure()?.errorText ?? "" }),
      );
      page.on("response", (response) => {
        if (response.status() >= 400) found.errorResponses.push({ method: response.request().method(), url: response.url(), status: response.status() });
      });
      const started = new Date();
      await use(found);
      await testInfo.attach("diagnostics.json", { body: JSON.stringify(found, null, 2), contentType: "application/json" });
      await attachServerLog(testInfo, started, new Date());
      expect.soft(found.pageErrors, "errors thrown in the page (diagnostics.json)").toEqual([]);
      expect.soft(found.blockedRequests, "requests to hosts other than 127.0.0.1 (diagnostics.json)").toEqual([]);
      expect.soft(found.unexpectedDialogs, "dialogs no step expected").toEqual([]);
    },
    { auto: true },
  ],

  app: async ({ page, diagnostics }, use, testInfo) => {
    await use(new App(page, testInfo, diagnostics));
  },
});

export { expect };

/** Whether the journey fails on what diagnostics found, though its steps passed. */
const failsOn = (found: Diagnostics) => found.pageErrors.length + found.blockedRequests.length + found.unexpectedDialogs.length > 0;

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
  await testInfo.attach("css.log", { body: [note, ...lines].join("\n"), contentType: "text/plain" });
}

export type { Page };
