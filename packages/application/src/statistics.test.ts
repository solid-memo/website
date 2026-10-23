// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import type { AnswerLog, DigestRepository } from "./ports";
import { createUseCases } from "./useCases";
import type { InstanceDigest } from "@solid-memo/domain/studyDigest";
import { CARD_FORMAT_VERSION, type Card, type Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { ReviewState } from "@solid-memo/domain/review";
import type { Answer } from "@solid-memo/domain/answer";
import { sm2s, instance, deck, card, makeDeps, memoryLog } from "./testing/fakePorts";
import { now, setup } from "./testing/digestWorld";

describe("the statistics of the answer log", () => {
  const noon = new Date(2026, 8, 21, 12, 0);
  const setup = () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    let id = 0;
    const useCases = createUseCases({
      ...deps,
      answerLog: log,
      newId: () => `id${++id}-0000-0000`,
    });
    return { deps, log, byMonth, useCases };
  };

  it("computes the statistics of the months asked for, of every deck or of one", async () => {
    const { byMonth, useCases } = setup();
    const answer = (studyDay: string, deckUrl = deck.url): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2025-09", [answer("2025-09-30")]);
    byMonth.set("2025-10", [answer("2025-10-01")]);
    byMonth.set("2026-09", [
      answer("2026-09-20"),
      answer("2026-09-21", "https://pod.example/other#deck"),
    ]);
    const all = await useCases.getStatistics(instance.url, noon);
    expect(all.days.map((day) => day.studyDay)).toEqual(["2025-10-01", "2026-09-20", "2026-09-21"]);
    expect(all.streaks).toEqual({ current: 2, longest: 2 });
    // The log reaches back past the year: it covers it all.
    expect(all.coverage).toBeNull();
    // How the answers were given comes with them: the card's second introduction is no first try.
    expect(all.firstTry).toEqual({ introduced: 2, recalled: 2 });
    expect(all.week.current.answers).toBe(1);
    // The hours of the day start where the learner's study day does.
    expect(all.dayBoundaryHour).toBe(DEFAULT_PREFERENCES.dayBoundaryHour);
    const one = await useCases.getStatistics(instance.url, noon, { months: 1, deckUrl: deck.url });
    expect(one.days.map((day) => day.studyDay)).toEqual(["2026-09-20"]);
    expect(one.decks).toEqual([
      expect.objectContaining({ introduced: 1, lapses: 0, quiz: { answers: 0, right: 0 } }),
    ]);
  });
  it("says since when times are recorded by every deck's answers, though one deck's statistics are asked for", async () => {
    const { byMonth, useCases } = setup();
    const answer = (studyDay: string, deckUrl: string, timed: boolean): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
      ...(timed ? { recallMillis: 3_000, gradeMillis: 1_000 } : {}),
    });
    byMonth.set("2026-09", [
      answer("2026-09-01", "https://pod.example/other#deck", true),
      // From a tab that recorded no times, after the app began to: unknown, not estimated.
      answer("2026-09-05", deck.url, false),
      answer("2026-09-20", deck.url, true),
    ]);
    const one = await useCases.getStatistics(instance.url, noon, { deckUrl: deck.url });
    expect(one.studyTime.recorded).toEqual({
      since: "2026-09-01",
      answers: 1,
      ms: 4_000,
      unknown: 1,
    });
  });
  it("computes the statistics of the last days asked for, or of the whole log, those up to today of the calendar's weeks, and says where the log begins", async () => {
    const { byMonth, log, useCases } = setup();
    const answer = (studyDay: string): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl: deck.url,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2025-08", [answer("2025-08-31")]);
    byMonth.set("2026-05", [answer("2026-05-31")]);
    byMonth.set("2026-08", [answer("2026-08-20"), answer("2026-08-23")]);
    byMonth.set("2026-09", [answer("2026-09-21")]);
    // 30 days up to September 21st begin on August 23rd; the figures up to
    // today look back over the calendar's 52 weeks, from September 29th 2025:
    // May is read for them, last August is not.
    const month = await useCases.getStatistics(instance.url, noon, { range: 30 });
    expect(month.days.map((day) => day.studyDay)).toEqual(["2026-08-23", "2026-09-21"]);
    expect(month.totals.answers).toBe(2);
    expect(month.recentDays.map((day) => day.studyDay)).toEqual([
      "2026-05-31",
      "2026-08-20",
      "2026-08-23",
      "2026-09-21",
    ]);
    // Last month's first 21 days lie before the range, and count all the same.
    expect(month.month.previous.answers).toBe(1);
    // Where the cards stood is told week by week from the range's first week, the answers before it read.
    expect(month.memory[0]).toMatchObject({ week: "2026-08-17", young: 1 });
    expect(month.coverage).toBeNull();
    expect(month.logBegins).toBe("2025-08");
    expect(log.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-05", undefined);
    expect(log.readMonthSince).not.toHaveBeenCalledWith(instance.url, "2025-08", undefined);
    // 500 days reach past last August, where the log begins.
    await expect(useCases.getStatistics(instance.url, noon, { range: 500 })).resolves.toMatchObject(
      { totals: { answers: 5 }, coverage: "2025-08" },
    );
    const all = await useCases.getStatistics(instance.url, noon, { range: "all" });
    expect(all.totals.answers).toBe(5);
    expect(all.coverage).toBe("2025-08");
    // An empty log covers nothing.
    byMonth.clear();
    await expect(
      useCases.getStatistics(instance.url, noon, { range: "all" }),
    ).resolves.toMatchObject({ totals: { answers: 0 }, coverage: null, logBegins: null });
  });
  it("saves the answers of the range asked for as a CSV file, of every deck or of one", async () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    const fileExchange = { save: vi.fn(), open: vi.fn(async () => null) };
    const useCases = createUseCases({ ...deps, answerLog: log, fileExchange });
    const answer = (studyDay: string, deckUrl = deck.url): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2026-05", [answer("2026-05-31")]);
    byMonth.set("2026-09", [answer("2026-09-21"), answer("2026-09-20", "https://pod.example/o#d")]);
    const rows = () => (fileExchange.save.mock.lastCall![2] as string).trim().split("\r\n");
    await useCases.saveAnswers(instance.url, noon, { range: 30 });
    expect(fileExchange.save).toHaveBeenCalledWith(
      "solid-memo-answers-2026-09-21.csv",
      "text/csv",
      expect.stringMatching(/^answered_at,study_day,/),
    );
    expect(rows().map((row) => row.split(",")[1])).toEqual([
      "study_day",
      "2026-09-20",
      "2026-09-21",
    ]);
    await useCases.saveAnswers(instance.url, noon, { range: "all", deckUrl: deck.url });
    expect(rows().map((row) => row.split(",")[1])).toEqual([
      "study_day",
      "2026-05-31",
      "2026-09-21",
    ]);
    await useCases.saveAnswers(instance.url, noon);
    expect(rows()).toHaveLength(4);
  });
  it("shares the months it read with loadAnswerLog, each read again only once it changed, and drops those the log no longer has", async () => {
    const { byMonth, log, useCases } = setup();
    const answer = (studyDay: string): Answer => ({
      id: `answer-${studyDay}`,
      deckUrl: deck.url,
      cardUrl: card.url,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T10:00:00.000Z`,
      studyDay,
      nextIntervalDays: 1,
    });
    byMonth.set("2025-01", [answer("2025-01-10")]);
    byMonth.set("2026-08", [answer("2026-08-10")]);
    byMonth.set("2026-09", [answer("2026-09-10")]);
    await useCases.getStatistics(instance.url, noon);
    expect(log.readMonthSince).toHaveBeenCalledTimes(2);
    expect(log.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-08", undefined);
    log.readMonthSince.mockClear();
    // The whole log keeps the year's months read, and reads them only to see they are unchanged.
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(3);
    expect(log.readMonthSince.mock.calls).toEqual([
      [instance.url, "2025-01", undefined],
      [instance.url, "2026-08", "v0"],
      [instance.url, "2026-09", "v0"],
    ]);
    log.readMonthSince.mockClear();
    // And the year again keeps what the whole log read.
    await expect(useCases.getStatistics(instance.url, noon)).resolves.toMatchObject({
      totals: { answers: 2 },
    });
    expect(log.readMonthSince.mock.calls).toEqual([
      [instance.url, "2026-08", "v0"],
      [instance.url, "2026-09", "v0"],
    ]);
    // A month the log no longer has is forgotten: when it comes back, it is read whole.
    const august = byMonth.get("2026-08")!;
    byMonth.delete("2026-08");
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(2);
    byMonth.set("2026-08", august);
    log.readMonthSince.mockClear();
    await useCases.loadAnswerLog(instance.url);
    expect(log.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-08", undefined);
  });
  it("reads a month once for reads asked at once, but again for one asked after an answer was added", async () => {
    const { byMonth, log, useCases } = setup();
    await useCases.recordReview(instance.url, deck, { card, direction: "front-to-back" }, 4, noon);
    await useCases.getStatistics(instance.url, noon);
    // Each read waits until let through.
    let letThrough = () => {};
    const gate = new Promise<void>((resolve) => (letThrough = resolve));
    const read = log.readMonthSince.getMockImplementation()!;
    log.readMonthSince.mockImplementation(async (...args) => {
      await gate;
      return read(...args);
    });
    log.readMonthSince.mockClear();
    const together = [
      useCases.getStatistics(instance.url, noon),
      useCases.getCardProgress(instance.url, noon, { deck }),
    ];
    await vi.waitFor(() => expect(log.readMonthSince).toHaveBeenCalledTimes(1));
    // An answer added meanwhile: the read under way may miss it, so a read asked after it does not share it.
    await useCases.recordReview(instance.url, deck, { card, direction: "back-to-front" }, 5, noon);
    const after = useCases.getStatistics(instance.url, noon);
    await vi.waitFor(() => expect(log.readMonthSince).toHaveBeenCalledTimes(2));
    letThrough();
    await Promise.all(together);
    await expect(after).resolves.toMatchObject({ totals: { answers: 2 } });
    expect(byMonth.get("2026-09")).toHaveLength(2);
    expect(log.readMonthSince).toHaveBeenCalledTimes(2);
  });

  describe("the today strip's figures", () => {
    const timed = (studyDay: string, at: string, recallMillis?: number): Answer => ({
      id: `answer-${studyDay}-${at}`,
      deckUrl: deck.url,
      cardUrl: `${card.url}-${at}`,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${studyDay}T${at}.000Z`,
      studyDay,
      priorIntervalDays: 3,
      nextIntervalDays: 7,
      ...(recallMillis === undefined ? {} : { recallMillis, gradeMillis: 500 }),
    });
    /** The log above and a digest kept in memory, for one page load after another. */
    function pages() {
      const { log, byMonth } = memoryLog();
      let stored: InstanceDigest | null = null;
      const digestRepository: DigestRepository = {
        readDigest: vi.fn(async () => stored),
        updateDigest: vi.fn(async (_instanceUrl, change) => {
          stored = change(stored);
        }),
      };
      const load = () => createUseCases({ ...makeDeps(), answerLog: log, digestRepository });
      return { log, byMonth, digestRepository, load, stored: () => stored };
    }
    const AUGUST = `${instance.url}history/2026-08.ttl`;

    it("are the year's statistics', each past month read once and then kept in the digest until it changes", async () => {
      const { log, byMonth, digestRepository, load, stored } = pages();
      byMonth.set("2025-08", [timed("2025-08-20", "10:00:00", 9000)]);
      // Of the month the activity calendar begins in (2025-09-29), the days before it do not count.
      byMonth.set("2025-09", [timed("2025-09-20", "10:00:00", 9000)]);
      byMonth.set("2026-08", [
        timed("2026-08-31", "10:00:00", 4000),
        timed("2026-08-31", "10:00:30", 6000),
      ]);
      byMonth.set("2026-09", [
        timed("2026-09-01", "10:00:00", 5000),
        timed("2026-09-21", "10:00:00", 7000),
      ]);
      const first = load();
      const figures = await first.getTodayFigures(instance.url, noon);
      const statistics = await first.getStatistics(instance.url, noon);
      expect(figures).toMatchObject({
        today: "2026-09-21",
        days: statistics.days.map(({ repeats: _, ...day }) => day),
        streaks: statistics.streaks,
        week: statistics.week,
        young: statistics.retention.young,
      });
      // 4.5, 5.5, 6.5 and 7.5 s with grading, each the middle of its second: the median is the same.
      expect(statistics.studyTime.medianAnswerMs).toBe(6000);
      expect(figures.medianAnswerMs).toBe(6000);
      expect(figures.days[0]!.studyDay).toBe("2026-08-31");
      // A month before those looked back over is not read.
      expect(log.readMonthSince).not.toHaveBeenCalledWith(instance.url, "2025-08", undefined);
      await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalledOnce());
      expect(Object.keys(stored()!.months)).toEqual([`${instance.url}history/2025-09.ttl`, AUGUST]);
      expect(stored()!.months[AUGUST]).toMatchObject({ document: AUGUST, version: "v0" });

      log.readMonthSince.mockClear();
      await expect(load().getTodayFigures(instance.url, noon)).resolves.toEqual(figures);
      expect(log.readMonthSince.mock.calls).toEqual([
        [instance.url, "2025-09", "v0"],
        [instance.url, "2026-08", "v0"],
        [instance.url, "2026-09", undefined],
      ]);
      expect(digestRepository.updateDigest).toHaveBeenCalledOnce();

      await log.append(instance.url, timed("2026-08-30", "10:00:00"));
      const changed = await load().getTodayFigures(instance.url, noon);
      expect(changed.days[0]).toMatchObject({ studyDay: "2026-08-30", answers: 1 });
      await vi.waitFor(() => expect(stored()!.months[AUGUST]!.version).toBe("v1"));
    });

    it("take in the whole range where it begins before the calendar's weeks, as the statistics do", async () => {
      const { log, byMonth, load } = pages();
      // On 31 December the range begins on 1 January, before the calendar's first Monday (5 January).
      const at = new Date(2026, 11, 31, 12, 0);
      byMonth.set("2025-12", [timed("2025-12-31", "10:00:00", 4000)]);
      byMonth.set("2026-01", [timed("2026-01-02", "10:00:00", 5000)]);
      byMonth.set("2026-12", [timed("2026-12-31", "10:00:00", 6000)]);
      const page = load();
      const figures = await page.getTodayFigures(instance.url, at);
      const statistics = await page.getStatistics(instance.url, at);
      expect(figures.days.map((day) => day.studyDay)).toEqual(["2026-01-02", "2026-12-31"]);
      expect(figures.days.map((day) => day.studyDay)).toEqual(
        statistics.recentDays.map((day) => day.studyDay),
      );
      expect(log.readMonthSince).not.toHaveBeenCalledWith(instance.url, "2025-12", undefined);
    });

    it("drop the summaries of months no longer looked back over, and keep none the pod gave no version of", async () => {
      const { log, byMonth, load, stored } = pages();
      byMonth.set("2026-08", [timed("2026-08-31", "10:00:00", 4000)]);
      await load().getTodayFigures(instance.url, new Date(2027, 6, 15, 12, 0));
      await vi.waitFor(() => expect(Object.keys(stored()!.months)).toEqual([AUGUST]));
      // In September 2027, August 2026 is of neither the last 12 months nor the calendar's weeks.
      await load().getTodayFigures(instance.url, new Date(2027, 8, 15, 12, 0));
      await vi.waitFor(() => expect(stored()!.months).toEqual({}));
      // Node Solid Server gives no ETag: every past month is read again each time.
      log.readMonthSince.mockImplementation(async (_instanceUrl, month) => ({
        unchanged: false,
        value: byMonth.get(month) ?? [],
        version: null,
      }));
      const figures = await load().getTodayFigures(instance.url, new Date(2027, 6, 15, 12, 0));
      expect(figures.days).toHaveLength(1);
      expect(stored()!.months).toEqual({});
    });

    it("estimate the median answer time from every answer while none was recorded, as the statistics do", async () => {
      const { byMonth, load } = pages();
      byMonth.set("2026-08", [timed("2026-08-31", "10:00:00"), timed("2026-08-31", "10:00:20")]);
      const page = load();
      const figures = await page.getTodayFigures(instance.url, noon);
      expect(figures.medianAnswerMs).toBe(20_000);
      expect(figures.medianAnswerMs).toBe(
        (await page.getStatistics(instance.url, noon)).studyTime.medianAnswerMs,
      );
      // And knows none without an answer.
      await expect(pages().load().getTodayFigures(instance.url, noon)).resolves.toMatchObject({
        days: [],
        medianAnswerMs: null,
      });
    });
  });
});

describe("the cards' progress", () => {
  it("tells how far along every deck's prompts are and what each has due, at its pace, and keeps its schedule", async () => {
    const { deps, useCases, stored, digestRepository } = setup();
    const other: Deck = {
      ...deck,
      id: "deck-2",
      url: `${instance.url}catalog.ttl#deck-2`,
      direction: "bidirectional",
      maxReviewsPerDay: 0,
      newCardsPerDay: 3,
    };
    vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([deck, other]);
    const report = await useCases.getCardProgress(instance.url, now);
    expect(report.today).toBe("2026-09-28");
    expect(report.decks.map((one) => ({ deck: one.deck, progress: one.progress }))).toEqual([
      { deck, progress: { new: 1, relearning: 0, young: 1, mature: 0 } },
      { deck: other, progress: { new: 3, relearning: 0, young: 1, mature: 0 } },
    ]);
    // The one prompt each deck has studied fell due before today. Each deck
    // at its own caps: the second lets no review through, so it never catches up.
    expect(
      report.decks.map(({ overdue, daysToClear, newCardsPerDay, introducedToday }) => ({
        overdue,
        daysToClear,
        newCardsPerDay,
        introducedToday,
      })),
    ).toEqual([
      {
        overdue: 1,
        daysToClear: 0,
        newCardsPerDay: DEFAULT_PREFERENCES.newCardsPerDay,
        introducedToday: 0,
      },
      { overdue: 1, daysToClear: null, newCardsPerDay: 3, introducedToday: 0 },
    ]);
    // That prompt, at an interval of a day.
    for (const one of report.decks) {
      expect(one.intervals[0]).toEqual({ from: 1, to: 2, count: 1 });
      expect(one.intervals.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
      expect(one.eases.reduce((sum, bin) => sum + bin.count, 0)).toBe(1);
    }
    const [own, paced] = report.decks.map((one) => one.forecast);
    expect(own).toHaveLength(30);
    expect(own![0]).toEqual({ studyDay: "2026-09-28", due: 1, reviews: 1 });
    expect(own!.slice(1).every(({ due }) => due === 0)).toBe(true);
    expect(paced![0]).toEqual({ studyDay: "2026-09-28", due: 1, reviews: 0 });
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledWith(deck, undefined);
    expect(deps.reviewStateRepository.readReviewStatesSince).toHaveBeenCalledWith(other, undefined);
    await vi.waitFor(() => expect(Object.keys(stored()!.schedules)).toEqual([deck.url, other.url]));
    expect(digestRepository.updateDigest).toHaveBeenCalledTimes(2);
  });
  it("tells how far along one deck's prompts are, without listing the decks", async () => {
    const { deps, useCases } = setup();
    const report = await useCases.getCardProgress(instance.url, now, { deck });
    expect(report.decks.map((one) => ({ deck: one.deck, progress: one.progress }))).toEqual([
      { deck, progress: { new: 1, relearning: 0, young: 1, mature: 0 } },
    ]);
    expect(deps.deckRepository.listDecks).not.toHaveBeenCalled();
  });
  it("forecasts from the digest's schedule while it is of the documents as they are, for the progress too", async () => {
    const schedule = {
      direction: deck.direction,
      dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
      scheduler: "sm2" as const,
      dueByDay: { "2026-09-25": 2, "2026-09-30": 7 },
      unreviewed: 0,
      studyDay: "2026-09-28",
      reviewedOnDay: 0,
      introducedOnDay: 2,
    };
    const { useCases, digestRepository } = setup({
      receipts: {},
      months: {},
      schedules: {
        [deck.url]: { deck: deck.url, cardsVersion: "c1", reviewsVersion: "r1", schedule },
      },
    });
    const report = await useCases.getCardProgress(instance.url, now, { deck });
    expect(report.decks[0]!.forecast[2]).toEqual({ studyDay: "2026-09-30", due: 7, reviews: 7 });
    // Two fell due before today: overdue now, and counted in today's forecast.
    expect(report.decks[0]!.overdue).toBe(2);
    expect(report.decks[0]!.forecast[0]).toEqual({ studyDay: "2026-09-28", due: 2, reviews: 2 });
    // The two prompts it says were first reviewed today count against today's new-card cap.
    expect(report.decks[0]!.introducedToday).toBe(2);
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });
  it("counts no prompt as met today from a digest's schedule of an earlier day", async () => {
    const schedule = {
      direction: deck.direction,
      dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
      scheduler: "sm2" as const,
      dueByDay: { "2026-09-30": 7 },
      unreviewed: 3,
      studyDay: "2026-09-27",
      reviewedOnDay: 4,
      introducedOnDay: 4,
    };
    const { useCases } = setup({
      receipts: {},
      months: {},
      schedules: {
        [deck.url]: { deck: deck.url, cardsVersion: "c1", reviewsVersion: "r1", schedule },
      },
    });
    const report = await useCases.getCardProgress(instance.url, now, { deck });
    expect(report.decks[0]!.introducedToday).toBe(0);
  });
  it("refuses a read without a version that says unchanged, for the progress too", async () => {
    const { deps, useCases } = setup();
    deps.reviewStateRepository.readReviewStatesSince = vi.fn(async () => ({
      unchanged: true as const,
    }));
    await expect(useCases.getCardProgress(instance.url, now, { deck })).rejects.toThrow(
      "came back unchanged",
    );
  });
});

describe("the Studio's answer history and schedule insight", () => {
  const at = new Date("2026-10-09T12:00:00.000Z");
  const live: Card = { ...card, formatVersion: CARD_FORMAT_VERSION };
  const other: Card = { ...live, id: "card-2", url: `${deck.cardsDocumentUrl}#card-2` };
  const retired: Card = {
    ...live,
    id: "card-3",
    url: `${deck.cardsDocumentUrl}#card-3`,
    retired: true,
  };
  const state = (cardId: string, extra: Partial<ReviewState> = {}): ReviewState => ({
    cardId,
    direction: "front-to-back",
    easeFactor: 2.5,
    intervalDays: 3,
    repetitions: 1,
    due: "2026-10-10",
    firstReviewedAt: "2026-10-01T10:00:00.000Z",
    lastReviewedAt: "2026-10-07T10:00:00.000Z",
    formatVersion: 2,
    ...extra,
  });
  const states = [
    state("card-1"),
    state("card-2", { due: "2026-10-09", intervalDays: 40, easeFactor: 1.3 }),
    state("card-3"),
  ];
  let n = 0;
  const answer = (
    cardId: string,
    grade: Answer["grade"],
    studyDay = "2026-10-01",
    extra: Partial<Answer> = {},
  ): Answer => ({
    id: `answer-${++n}`,
    deckUrl: deck.url,
    // Answered before an upgrade moved the cards into another document.
    cardUrl: `${instance.url}decks/deck-1-old.ttl#${cardId}`,
    direction: "front-to-back",
    grade,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    nextIntervalDays: 1,
    ...extra,
  });

  /** An answer to a prompt already introduced. */
  const reviewed = { priorIntervalDays: 1 };

  /** An answer log of two months, at versions "s1" and "o1"; cards at "c1", reviews at "r1"; a digest kept in memory. */
  function setup(digest: InstanceDigest | null = null) {
    const deps = makeDeps();
    const months: Record<string, Answer[]> = {
      // card-1 lapses four times in its reviews; its course answer is no lapse.
      "2026-09": [
        answer("card-1", 1, "2026-09-12", reviewed),
        answer("card-1", 2, "2026-09-13", reviewed),
        answer("card-1", 1, "2026-09-14", reviewed),
      ],
      "2026-10": [
        answer("card-1", 0, "2026-10-01", reviewed),
        answer("card-1", 2, "2026-10-02", {
          ...reviewed,
          mode: "multiple-choice",
          chosenDistractor: `${instance.url}decks/deck-1-old.ttl#card-1-d1`,
        }),
        answer("card-1", 4, "2026-10-03", reviewed),
        answer("card-2", 1, "2026-10-01", reviewed),
        answer("card-3", 0, "2026-10-01", reviewed),
        answer("card-3", 0, "2026-10-02", reviewed),
        answer("card-3", 0, "2026-10-03", reviewed),
        answer("card-3", 0, "2026-10-04", reviewed),
        answer("card-1", 0, "2026-10-04", { deckUrl: `${instance.url}catalog.ttl#deck-2` }),
      ],
    };
    const versions: Record<string, string> = { "2026-09": "s1", "2026-10": "o1" };
    const answerLog: AnswerLog = {
      append: vi.fn(async () => undefined),
      appendAll: vi.fn(async () => undefined),
      months: vi.fn(async () => Object.keys(months)),
      readMonth: vi.fn(),
      readMonthSince: vi.fn(
        async (_instanceUrl: string, month: string, version: string | undefined) =>
          version === versions[month]
            ? { unchanged: true as const }
            : { unchanged: false as const, value: months[month]!, version: versions[month]! },
      ),
      removeDay: vi.fn(),
      removeAnswer: vi.fn(),
    };
    let stored = digest;
    const digestRepository: DigestRepository = {
      readDigest: vi.fn(async () => stored),
      updateDigest: vi.fn(async (_instanceUrl, change) => {
        stored = change(stored);
      }),
    };
    vi.mocked(deps.deckRepository.readCardsSince).mockResolvedValue({
      unchanged: false,
      value: [live, other, retired],
      version: "c1",
    });
    vi.mocked(deps.reviewStateRepository.readReviewStatesSince).mockResolvedValue({
      unchanged: false,
      value: sm2s(states),
      version: "r1",
    });
    const useCases = createUseCases({ ...deps, answerLog, digestRepository });
    return { deps, useCases, answerLog, months, versions, digestRepository, stored: () => stored };
  }

  it("loads every month of the answer log, and reads one again only once it changed", async () => {
    const { useCases, answerLog, months, versions } = setup();
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(12);
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-09", undefined);
    months["2026-10"] = [...months["2026-10"]!, answer("card-2", 5, "2026-10-08")];
    versions["2026-10"] = "o2";
    vi.mocked(answerLog.readMonthSince).mockClear();
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(13);
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-09", "s1");
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-10", "o1");
    // Unchanged months come from what was read before.
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(13);
  });

  it("keeps no month the log gave no version of, and reads it again each time", async () => {
    const { useCases, answerLog } = setup();
    vi.mocked(answerLog.readMonthSince).mockResolvedValue({
      unchanged: false,
      value: [answer("card-1", 3)],
      version: null,
    });
    await useCases.loadAnswerLog(instance.url);
    vi.mocked(answerLog.readMonthSince).mockClear();
    await expect(useCases.loadAnswerLog(instance.url)).resolves.toHaveLength(2);
    expect(answerLog.readMonthSince).toHaveBeenCalledWith(instance.url, "2026-09", undefined);
  });

  it("gives a card's answers in its deck, newest first, named in the deck's cards document as it is now", async () => {
    const { useCases } = setup();
    const answers = await useCases.cardAnswers(instance.url, deck, "card-1");
    expect(answers.map((each) => [each.studyDay, each.grade])).toEqual([
      ["2026-10-03", 4],
      ["2026-10-02", 2],
      ["2026-10-01", 0],
      ["2026-09-14", 1],
      ["2026-09-13", 2],
      ["2026-09-12", 1],
    ]);
    expect(answers[1]).toMatchObject({
      cardUrl: live.url,
      chosenDistractor: `${deck.cardsDocumentUrl}#card-1-d1`,
    });
  });

  it("finds the deck's hardest cards in use and the wrong options chosen most, in the last twelve months", async () => {
    const { deps, useCases, answerLog, months, versions } = setup();
    const asked: Card = { ...live, distractors: [{ id: "card-1-d1", text: { en: "wrong" } }] };
    vi.mocked(deps.deckRepository.readCardsSince).mockResolvedValue({
      unchanged: false,
      value: [asked, other, retired],
      version: "c1",
    });
    // Before the twelve months, which begin on November 1st, 2025: not read.
    months["2025-10"] = [answer("card-2", 0, "2025-10-31", reviewed)];
    versions["2025-10"] = "p1";
    const report = await useCases.getCardProgress(instance.url, at, { deck });
    const [progress] = report.decks;
    // card-1 lapses four times in five reviews (its course answer is none);
    // card-2 once in one; card-3 is retired; the other deck's answer is not this deck's.
    expect(progress!.hardest).toEqual({
      reviews: 10,
      cards: [
        { card: asked, lapses: 4, reviews: 5 },
        { card: other, lapses: 1, reviews: 1 },
      ],
    });
    expect(progress!.courseAnswers).toBe(1);
    expect(progress!.confusions).toEqual([
      { card: asked, distractor: asked.distractors![0], picks: 1 },
    ]);
    expect(answerLog.readMonthSince).not.toHaveBeenCalledWith(instance.url, "2025-10", undefined);
    expect(deps.deckRepository.readCardsSince).toHaveBeenCalledTimes(1);
  });

  it("shows the cards' progress without what is hard when the answer log cannot be read", async () => {
    const { useCases, answerLog } = setup();
    vi.mocked(answerLog.readMonthSince).mockRejectedValue(new Error("403"));
    const [progress] = (await useCases.getCardProgress(instance.url, at, { deck })).decks;
    expect(progress!.progress).not.toBeUndefined();
    expect(progress!.hardest).toEqual({ reviews: 0, cards: [] });
    expect(progress!.courseAnswers).toBe(0);
    expect(progress!.confusions).toEqual([]);
    vi.mocked(answerLog.months).mockRejectedValue(new Error("unreachable"));
    await expect(useCases.getCardProgress(instance.url, at, { deck })).resolves.toMatchObject({
      decks: [{ hardest: { reviews: 0, cards: [] } }],
    });
  });

  it("forecasts the deck's reviews capped by its pace, spreads its prompts, and finds its leeches in use", async () => {
    const { useCases, digestRepository, stored } = setup();
    const insight = await useCases.deckInsight(
      instance.url,
      { ...deck, maxReviewsPerDay: 1 },
      at,
      DEFAULT_PREFERENCES,
    );
    expect(insight.today).toBe("2026-10-09");
    expect(insight.maxReviewsPerDay).toBe(1);
    expect(insight.forecast).toHaveLength(30);
    expect(insight.forecast.slice(0, 3)).toEqual([
      { studyDay: "2026-10-09", due: 1, reviews: 1 },
      { studyDay: "2026-10-10", due: 1, reviews: 1 },
      { studyDay: "2026-10-11", due: 0, reviews: 0 },
    ]);
    // The retired card is not scheduled.
    expect(insight.scheduled).toBe(2);
    expect(insight.intervals.find((bin) => bin.from === 2)).toMatchObject({ count: 1 });
    expect(insight.eases[0]).toMatchObject({ from: 1.3, count: 1 });
    expect(insight.lapses.since).toBe("2026-09");
    expect(insight.lapses.lapses.get(live.url)).toBe(4);
    // card-3 is forgotten as often, but retired.
    expect(insight.leeches).toEqual([{ card: live, lapses: 4 }]);
    // The schedule was computed afresh, and kept.
    await vi.waitFor(() => expect(digestRepository.updateDigest).toHaveBeenCalled());
    expect(stored()!.schedules[deck.url]).toMatchObject({
      cardsVersion: "c1",
      reviewsVersion: "r1",
    });
  });

  it("forecasts from the digest's schedule while it is of the documents as they are, with the instance's pace", async () => {
    const schedule = {
      direction: "front-to-back" as const,
      dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
      scheduler: "sm2" as const,
      dueByDay: { "2026-10-11": 7 },
      unreviewed: 0,
      studyDay: "2026-10-09",
      reviewedOnDay: 0,
      introducedOnDay: 0,
    };
    const { useCases, digestRepository } = setup({
      receipts: {},
      months: {},
      schedules: {
        [deck.url]: { deck: deck.url, cardsVersion: "c1", reviewsVersion: "r1", schedule },
      },
    });
    const insight = await useCases.deckInsight(instance.url, deck, at, DEFAULT_PREFERENCES);
    expect(insight.maxReviewsPerDay).toBe(DEFAULT_PREFERENCES.maxReviewsPerDay);
    expect(insight.forecast[2]).toEqual({ studyDay: "2026-10-11", due: 7, reviews: 7 });
    expect(insight.forecast[0]).toEqual({ studyDay: "2026-10-09", due: 0, reviews: 0 });
    expect(digestRepository.updateDigest).not.toHaveBeenCalled();
  });
});
