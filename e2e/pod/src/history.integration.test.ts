// @vitest-environment node

// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The answer log against a real Solid server (docs/data-model.md): an
 * answer is added to its month's document with one insert-only PATCH,
 * unread and unconditional, which every server tested creates when it is
 * missing and keeps however many tabs add at once; resetting a study day
 * removes that deck's answers of the day; the statistics and the Studio
 * read a month again only once it changed, sharing what they read. Runs
 * against each server globalSetup.ts starts. With MEASURE_ANSWER_LOG set,
 * it also measures reading a large log (docs/statistics.md, "Loading").
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import type { Answer } from "@solid-memo/domain/answer";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/sources";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createUseCases } from "@solid-memo/application/useCases";
import { statisticsOf } from "@solid-memo/domain/statistics";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidPreferencesRepository } from "@solid-memo/solid/solidPreferencesRepository";
import { ETAG_OUTLIVES_EDITS, etagMarksEveryEdit, versioned } from "./serverTraits";

const SERVERS = inject("solidServers");

/** The answer log as createAppUseCases wires it: every answer checked against its shape before it is added. */
function answerLog() {
  const shapeValidator = createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES });
  return createSolidAnswerLog({ fetch, checkWrite: shapeValidator.checkSubjects });
}

function answerOf(instanceUrl: string, studyDay: string, deck: string, n: number): Answer {
  return {
    id: `answer-${studyDay.replace(/-/g, "")}T100000000Z-${n}`,
    deckUrl: `${instanceUrl}catalog.ttl#${deck}`,
    cardUrl: `${instanceUrl}decks/${deck}.ttl#card-${n}`,
    direction: n % 2 === 0 ? "front-to-back" : "back-to-front",
    grade: (n % 6) as Answer["grade"],
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    ...(n % 3 === 0 ? {} : { priorIntervalDays: n }),
    nextIntervalDays: n + 1,
  };
}

/** One read of a month's document: its status and the bytes of its body. */
interface MonthRead {
  url: string;
  status: number;
  bytes: number;
}

/**
 * A page of the app reading the log as createAppUseCases wires it (only
 * what the statistics need), each read of a month's document recorded;
 * each call is a new page, with nothing in memory. `bodies` keeps what
 * each month's read gave, for parsing again without the server.
 */
function page() {
  const reads: MonthRead[] = [];
  const bodies = new Map<string, { body: string; etag: string | null }>();
  const recording: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const url = String(input);
    if (!/\/history\/\d{4}-\d{2}\.ttl$/.test(url) || (init?.method ?? "GET") !== "GET")
      return response;
    const body = await response.clone().text();
    reads.push({ url, status: response.status, bytes: new TextEncoder().encode(body).length });
    if (response.status === 200) bodies.set(url, { body, etag: response.headers.get("ETag") });
    return response;
  };
  const useCases = createUseCases({
    sessionGateway: undefined as never,
    storageGateway: undefined as never,
    deckLibrary: undefined as never,
    webIdDocumentRepository: undefined as never,
    instanceRepository: undefined as never,
    deckRepository: undefined as never,
    preferencesRepository: createSolidPreferencesRepository({ fetch: recording }),
    reviewStateRepository: undefined as never,
    shapeValidator: undefined as never,
    repairRepository: undefined as never,
    instanceCopier: undefined as never,
    answerLog: createSolidAnswerLog({ fetch: recording }),
  });
  return { useCases, reads, bodies };
}

describe.each(SERVERS)("the answer log on $name", ({ url: server }) => {
  /** Whether its ETag changes on every edit (etagMarksEveryEdit). */
  let everyEdit = false;
  beforeAll(async () => {
    everyEdit = await etagMarksEveryEdit(server);
  });

  it("reads a month again only once it changed since the version read", async (context) => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    await expect(log.readMonthSince(instanceUrl, "2026-09", undefined)).resolves.toEqual({
      unchanged: false,
      value: [],
      version: "absent",
    });
    const first = answerOf(instanceUrl, "2026-09-21", "deck-1", 1);
    await log.append(instanceUrl, first);
    const read = await log.readMonthSince(instanceUrl, "2026-09", "absent");
    expect(read).toMatchObject({ unchanged: false, value: [first] });
    if (read.unchanged || read.version === null)
      return context.skip("this server gives no ETag on a read, so every read is a whole one");
    await expect(log.readMonthSince(instanceUrl, "2026-09", read.version)).resolves.toEqual({
      unchanged: true,
    });
    if (!everyEdit) return context.skip(ETAG_OUTLIVES_EDITS);
    const second = answerOf(instanceUrl, "2026-09-22", "deck-1", 2);
    await log.append(instanceUrl, second);
    const again = await log.readMonthSince(instanceUrl, "2026-09", read.version);
    expect(again.unchanged).toBe(false);
    expect(again.unchanged ? [] : again.value).toEqual(expect.arrayContaining([first, second]));
  });

  it("adds answers to month documents it creates as needed, all of several added at once, and reads them back", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    await expect(log.months(instanceUrl)).resolves.toEqual([]);
    const october = answerOf(instanceUrl, "2026-10-01", "deck-1", 1);
    await log.append(instanceUrl, october);
    const september = Array.from({ length: 5 }, (_, i) =>
      answerOf(instanceUrl, "2026-09-21", "deck-1", i + 2),
    );
    await Promise.all(september.map((answer) => log.append(instanceUrl, answer)));
    await expect(log.months(instanceUrl)).resolves.toEqual(["2026-09", "2026-10"]);
    const read = await log.readMonth(instanceUrl, "2026-09");
    expect(read).toHaveLength(5);
    expect(read).toEqual(expect.arrayContaining(september));
    await expect(log.readMonth(instanceUrl, "2026-10")).resolves.toEqual([october]);
  });

  it("removes a deck's answers of a study day, and only those", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const kept = [
      answerOf(instanceUrl, "2026-09-20", "deck-1", 1),
      answerOf(instanceUrl, "2026-09-21", "deck-2", 2),
    ];
    for (const answer of [
      ...kept,
      answerOf(instanceUrl, "2026-09-21", "deck-1", 3),
      answerOf(instanceUrl, "2026-09-21", "deck-1", 4),
    ]) {
      await log.append(instanceUrl, answer);
    }
    await log.removeDay(instanceUrl, `${instanceUrl}catalog.ttl#deck-1`, "2026-09-21");
    const left = await log.readMonth(instanceUrl, "2026-09");
    expect(left).toHaveLength(2);
    expect(left).toEqual(expect.arrayContaining(kept));
  });

  it("adds nothing that does not fit the answer shape", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const odd = {
      ...answerOf(instanceUrl, "2026-09-21", "deck-1", 1),
      grade: 7,
    } as unknown as Answer;
    await expect(log.append(instanceUrl, odd)).rejects.toThrow(
      "An answer's grade is one whole number, 0 to 5.",
    );
    await expect(log.months(instanceUrl)).resolves.toEqual([]);
  });

  it("reads the statistics' months and the whole log through one cache, a month again only once it changed", async (context) => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const at = new Date("2026-09-21T12:00:00.000Z");
    // A month long before the year the statistics read, and two in it.
    for (const studyDay of ["2025-01-10", "2026-08-10", "2026-09-10"])
      await log.append(instanceUrl, answerOf(instanceUrl, studyDay, "deck-1", 1));
    const { useCases, reads } = page();
    const statusOf = (month: string) =>
      reads.filter((read) => read.url.endsWith(`/history/${month}.ttl`)).map((read) => read.status);
    await expect(useCases.getStatistics(instanceUrl, at)).resolves.toMatchObject({
      totals: { answers: 2 },
      coverage: null,
    });
    expect(statusOf("2025-01")).toEqual([]);
    if (!(await versioned(`${instanceUrl}history/2026-09.ttl`)))
      return context.skip("this server gives no ETag on a read, so every read is a whole one");
    reads.length = 0;
    // The whole log reads only the month the statistics did not; the others are unchanged.
    await expect(useCases.loadAnswerLog(instanceUrl)).resolves.toHaveLength(3);
    expect([statusOf("2025-01"), statusOf("2026-08"), statusOf("2026-09")]).toEqual([
      [200],
      [304],
      [304],
    ]);
    await expect(useCases.getStatistics(instanceUrl, at, { range: "all" })).resolves.toMatchObject({
      totals: { answers: 3 },
      coverage: "2025-01",
    });
    if (!everyEdit) return context.skip(ETAG_OUTLIVES_EDITS);
    reads.length = 0;
    // An answer changes its month alone: only that is read again.
    await log.append(instanceUrl, answerOf(instanceUrl, "2026-09-21", "deck-1", 2));
    await expect(useCases.getStatistics(instanceUrl, at)).resolves.toMatchObject({
      totals: { answers: 3 },
    });
    expect([statusOf("2026-08"), statusOf("2026-09")]).toEqual([[304], [200]]);
  });

  it.runIf(process.env.MEASURE_ANSWER_LOG)(
    "measures reading a large log: a year, and two, of a hundred answers a day",
    { timeout: 30 * 60_000 },
    async () => {
      const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
      const log = createSolidAnswerLog({ fetch });
      const at = new Date("2026-09-30T12:00:00.000Z");
      const perDay = 100;
      // Two years up to `at`: 100 answers a day, to 2,000 cards in both directions.
      const days = Array.from({ length: 730 }, (_, i) =>
        new Date(at.getTime() - (729 - i) * 86_400_000).toISOString().slice(0, 10),
      );
      const seeding = performance.now();
      const cardIds = Array.from({ length: 2_000 }, () => crypto.randomUUID());
      const byMonth = new Map<string, Answer[]>();
      days.forEach((studyDay, day) => {
        for (let n = 0; n < perDay; n++) {
          const card = (day * perDay + n) % 2_000;
          const month = studyDay.slice(0, 7);
          const answer: Answer = {
            id: `answer-${studyDay.replace(/-/g, "")}T10${String(n).padStart(4, "0")}00Z-${crypto.randomUUID().slice(0, 9)}`,
            deckUrl: `${instanceUrl}catalog.ttl#deck-${card % 4}`,
            cardUrl: `${instanceUrl}decks/deck-${card % 4}.ttl#${cardIds[card]}`,
            direction: n % 2 === 0 ? "front-to-back" : "back-to-front",
            grade: (n % 6) as Answer["grade"],
            answeredAt: `${studyDay}T10:${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}.000Z`,
            studyDay,
            ...(day < 20 ? {} : { priorIntervalDays: (n % 40) + 1 }),
            nextIntervalDays: (n % 40) + 2,
          };
          const answers = byMonth.get(month);
          if (answers === undefined) byMonth.set(month, [answer]);
          else answers.push(answer);
        }
      });
      // Each month written whole with one PUT of the triples the app would add (an insert of
      // thousands, PATCH by PATCH, takes the server too long), then its last answer added as
      // the app adds one, so the server keeps the month as it keeps one the app wrote.
      for (const [month, answers] of byMonth) {
        const triples: string[] = [];
        const capture: typeof fetch = async (_input, init) => {
          triples.push(String(init!.body).replace(/^INSERT DATA \{\n|\n\};\n$/g, ""));
          return new Response(null, { status: 205 });
        };
        await createSolidAnswerLog({ fetch: capture }).appendAll(instanceUrl, answers.slice(0, -1));
        const response = await fetch(`${instanceUrl}history/${month}.ttl`, {
          method: "PUT",
          headers: { "content-type": "text/turtle" },
          body: triples.join("\n"),
        });
        expect(response.ok).toBe(true);
        await log.append(instanceUrl, answers.at(-1)!);
      }
      const seeded = performance.now() - seeding;

      const measure = async (range: { months: number } | { range: "all" }) => {
        const { useCases, reads, bodies } = page();
        let start = performance.now();
        const first = await useCases.getStatistics(instanceUrl, at, range);
        const cold = performance.now() - start;
        const bytes = reads.reduce((sum, read) => sum + read.bytes, 0);
        const months = reads.length;
        reads.length = 0;
        start = performance.now();
        await useCases.getStatistics(instanceUrl, at, range);
        const warm = performance.now() - start;
        const unchanged = reads.filter((read) => read.status === 304).length;
        // The same documents parsed again from memory: Turtle to answers, no server.
        const replay: typeof fetch = async (input) => {
          const kept = bodies.get(String(input))!;
          const response = new Response(kept.body, {
            status: 200,
            headers: { "content-type": "text/turtle", ...(kept.etag ? { etag: kept.etag } : {}) },
          });
          // As a fetch gives it: the dataset is named by the response's URL.
          return Object.defineProperty(response, "url", { value: String(input) });
        };
        const offline = createSolidAnswerLog({ fetch: replay });
        start = performance.now();
        const parsed = await Promise.all(
          [...bodies.keys()].map((url) =>
            offline.readMonth(instanceUrl, url.slice(-"YYYY-MM.ttl".length, -".ttl".length)),
          ),
        );
        const parse = performance.now() - start;
        start = performance.now();
        statisticsOf(parsed.flat(), first.today);
        const compute = performance.now() - start;
        return {
          answers: first.totals.answers,
          months,
          megabytes: +(bytes / 1_000_000).toFixed(1),
          coldMs: Math.round(cold),
          parseMs: Math.round(parse),
          computeMs: Math.round(compute),
          warmMs: Math.round(warm),
          unchanged,
        };
      };
      const year = await measure({ months: 12 });
      const all = await measure({ range: "all" });
      console.info(JSON.stringify({ server, seededMs: Math.round(seeded), year, all }, null, 2));
      expect(year.answers).toBeGreaterThan(36_000);
      expect(all.answers).toBe(days.length * perDay);
    },
  );
});
