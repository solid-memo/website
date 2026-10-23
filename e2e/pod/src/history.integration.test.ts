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
 * read a month again only once it changed, sharing what they read, and
 * the figures of memory follow a card across months; the today strip
 * keeps a summary of each past month in the digest, read again only once
 * it changed. Runs against each server globalSetup.ts starts. With
 * MEASURE_ANSWER_LOG set, it also measures reading a large log
 * (docs/statistics.md, "Loading").
 */
import { beforeAll, describe, expect, inject, it } from "vitest";
import type { Answer } from "@solid-memo/domain/answer";
import { SHAPE_SOURCES, shapesFetch } from "@solid-memo/vocab/tooling/testing/shapeSources";
import { createShaclShapeValidator } from "@solid-memo/solid/shaclShapeValidator";
import { createUseCases } from "@solid-memo/application/useCases";
import { NO_PORTS } from "@solid-memo/application/testing/noPorts";
import { statisticsOf } from "@solid-memo/domain/statistics";
import { createSolidAnswerLog } from "@solid-memo/solid/solidAnswerLog";
import { createSolidDigestRepository } from "@solid-memo/solid/solidDigestRepository";
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
    // Every other answer timed, as answers given since vocabulary 1.19 are.
    ...(n % 2 === 0
      ? {}
      : {
          recallMillis: 1000 + n,
          gradeMillis: 500 + n,
          ...(n % 3 === 0 ? {} : { priorDue: studyDay }),
          utcOffsetMinutes: n % 4 === 1 ? 120 : -300,
        }),
  };
}

/** The digest's month summaries, once a page's write of them is done: as many as `count`. */
async function summariesWritten(instanceUrl: string, count: number) {
  const digests = createSolidDigestRepository({ fetch });
  await expect
    .poll(async () => Object.keys((await digests.readDigest(instanceUrl))?.months ?? {}).length, {
      timeout: 60_000,
    })
    .toBe(count);
  return (await digests.readDigest(instanceUrl))!.months;
}

/** One read of a month's document or of the digest: its status and the bytes of its body. */
interface MonthRead {
  url: string;
  status: number;
  bytes: number;
}

/**
 * A page of the app reading the log as createAppUseCases wires it (only
 * what the statistics and the today strip need), each read of a month's
 * document recorded, and each of the digest (`digestReads`);
 * each call is a new page, with nothing in memory. `bodies` keeps what
 * each month's read gave, for parsing again without the server.
 */
function page() {
  const reads: MonthRead[] = [];
  const digestReads: MonthRead[] = [];
  const bodies = new Map<string, { body: string; etag: string | null }>();
  const recording: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const url = String(input);
    if ((init?.method ?? "GET") !== "GET") return response;
    const month = /\/history\/\d{4}-\d{2}\.ttl$/.test(url);
    if (!month && !url.endsWith("/digest.ttl")) return response;
    const body = await response.clone().text();
    const read = { url, status: response.status, bytes: new TextEncoder().encode(body).length };
    if (!month) {
      digestReads.push(read);
      return response;
    }
    reads.push(read);
    if (response.status === 200) bodies.set(url, { body, etag: response.headers.get("ETag") });
    return response;
  };
  const useCases = createUseCases({
    ...NO_PORTS,
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
    digestRepository: createSolidDigestRepository({
      fetch: recording,
      checkWrite: createShaclShapeValidator({ fetch, shapesFetch, ...SHAPE_SOURCES }).checkSubjects,
    }),
  });
  return { useCases, reads, digestReads, bodies };
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

  it("removes one answer by its id, and only it", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const undone = answerOf(instanceUrl, "2026-09-21", "deck-1", 3);
    const kept = [
      answerOf(instanceUrl, "2026-09-21", "deck-1", 1),
      answerOf(instanceUrl, "2026-09-20", "deck-1", 2),
    ];
    for (const answer of [...kept, undone]) await log.append(instanceUrl, answer);
    await log.removeAnswer(instanceUrl, undone.studyDay, undone.id);
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
    const backwards = { ...answerOf(instanceUrl, "2026-09-21", "deck-1", 1), recallMillis: -1 };
    await expect(log.append(instanceUrl, backwards)).rejects.toThrow(
      "A recall time is one whole number of milliseconds, 0 or more.",
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

  it("tells how late a review was and how its card grew, from answers months apart", async () => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const at = new Date("2026-09-21T12:00:00.000Z");
    // One card's reviews from July on: on time until it grows mature, then 2 days late.
    const steps: [string, number | undefined, number][] = [
      ["2026-07-01", undefined, 1],
      ["2026-07-02", 1, 6],
      ["2026-07-08", 6, 15],
      ["2026-07-23", 15, 38],
      ["2026-09-01", 38, 90],
    ];
    for (const [studyDay, prior, next] of steps) {
      const { priorIntervalDays: _, ...answer } = answerOf(instanceUrl, studyDay, "deck-1", 2);
      await log.append(instanceUrl, {
        ...answer,
        grade: 4,
        ...(prior === undefined ? {} : { priorIntervalDays: prior }),
        nextIntervalDays: next,
      });
    }
    const { useCases } = page();
    // The last 30 days hold one review; July, read for the figures up to today, says how late.
    const month = await useCases.getStatistics(instanceUrl, at, { range: 30 });
    expect(month.lateness.find((one) => one.lateness === "late1")!.recall).toEqual({
      reviews: 1,
      recalled: 1,
    });
    expect(month.intervals.find((bin) => bin.from === 31)!.recall.reviews).toBe(1);
    expect(month.memory.at(-1)).toMatchObject({ mature: 1, young: 0, medianInterval: 90 });
    // It grew mature before the range; over the whole log, in 22 days and 3 reviews.
    expect(month.timeToMature.prompts).toBe(0);
    const all = await useCases.getStatistics(instanceUrl, at, { range: "all" });
    expect(all.timeToMature).toEqual({ prompts: 1, days: 22, reviews: 3 });
    expect(all.lateness[0]!.recall).toEqual({ reviews: 3, recalled: 3 });
  });

  it("summarizes the past months for the today strip once, then reads them again only once they changed", async (context) => {
    const instanceUrl = new URL(`run-${crypto.randomUUID()}/solid-memo/main/`, server).href;
    const log = answerLog();
    const at = new Date("2026-09-21T12:00:00.000Z");
    for (const answer of [
      answerOf(instanceUrl, "2026-07-30", "deck-1", 1),
      answerOf(instanceUrl, "2026-08-31", "deck-1", 2),
      answerOf(instanceUrl, "2026-09-01", "deck-1", 3),
      answerOf(instanceUrl, "2026-09-21", "deck-1", 5),
    ])
      await log.append(instanceUrl, answer);
    const first = page();
    const figures = await first.useCases.getTodayFigures(instanceUrl, at);
    const statistics = await first.useCases.getStatistics(instanceUrl, at);
    expect(figures).toMatchObject({ streaks: statistics.streaks, week: statistics.week });
    // 1502, 1506 and 1510 ms: the median, 1506 ms, counted as the middle of its second.
    expect(statistics.studyTime.medianAnswerMs).toBe(1506);
    expect(figures.medianAnswerMs).toBe(1500);
    if (!(await versioned(`${instanceUrl}history/2026-07.ttl`)))
      return context.skip("this server gives no ETag on a read, so every past month is read whole");
    // The summaries are written in the background, conforming to their shape (checkWrite).
    await summariesWritten(instanceUrl, 2);
    const second = page();
    await expect(second.useCases.getTodayFigures(instanceUrl, at)).resolves.toEqual(figures);
    expect(
      second.reads.map((read) => [read.url.slice(-"YYYY-MM.ttl".length), read.status]).sort(),
    ).toEqual([
      ["2026-07.ttl", 304],
      ["2026-08.ttl", 304],
      ["2026-09.ttl", 200],
    ]);
    if (!everyEdit) return context.skip(ETAG_OUTLIVES_EDITS);
    await log.append(instanceUrl, answerOf(instanceUrl, "2026-08-30", "deck-1", 7));
    const third = page();
    const changed = await third.useCases.getTodayFigures(instanceUrl, at);
    expect(changed.streaks.longest).toBe(figures.streaks.longest + 1);
    expect(third.reads.filter((read) => read.status === 200)).toHaveLength(2);
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
            // Timed, as every answer given since vocabulary 1.19 is.
            recallMillis: 2000 + ((n * 37) % 8000),
            gradeMillis: 400 + ((n * 11) % 1200),
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
      // The today strip on a second page load: the past months' summaries checked, this month read.
      const strip = async () => {
        const learning = page();
        await learning.useCases.getTodayFigures(instanceUrl, at);
        // Where the server gives versions, the past months' summaries are written in the background.
        const thisMonth = `${instanceUrl}history/${at.toISOString().slice(0, 7)}.ttl`;
        if (await versioned(thisMonth))
          await summariesWritten(
            instanceUrl,
            new Set(learning.reads.map((read) => read.url).filter((url) => url !== thisMonth)).size,
          );
        const { useCases, reads, digestReads } = page();
        const start = performance.now();
        await useCases.getTodayFigures(instanceUrl, at);
        const ms = performance.now() - start;
        const bytes = [...reads, ...digestReads].reduce((sum, read) => sum + read.bytes, 0);
        return {
          months: reads.length,
          unchanged: reads.filter((read) => read.status === 304).length,
          megabytes: +(bytes / 1_000_000).toFixed(1),
          digestKilobytes: Math.round(
            digestReads.reduce((sum, read) => sum + read.bytes, 0) / 1000,
          ),
          ms: Math.round(ms),
        };
      };
      const year = await measure({ months: 12 });
      const all = await measure({ range: "all" });
      const today = await strip();
      console.info(
        JSON.stringify({ server, seededMs: Math.round(seeded), year, all, today }, null, 2),
      );
      expect(year.answers).toBeGreaterThan(36_000);
      expect(all.answers).toBe(days.length * perDay);
    },
  );
});
