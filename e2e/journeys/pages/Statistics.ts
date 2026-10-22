// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { expect, test, type Locator } from "@playwright/test";
import { Screen } from "./Screen.ts";
import { escapeRegExp, textPattern } from "../harness/strings.ts";
import { cellOf } from "./tables.ts";

/** The statistics' tabs, as the URL names them. */
export type StatisticsTab = "overview" | "activity" | "memory" | "cards";

/** The ranges the statistics can be of, as the URL names them. */
export type StatisticsRange = "30d" | "90d" | "12m" | "all";

const TAB_NAMES = {
  overview: "statistics.tabOverview",
  activity: "statistics.tabActivity",
  memory: "statistics.tabMemory",
  cards: "statistics.tabCards",
} as const;

const RANGE_NAMES = {
  "30d": "statistics.range30d",
  "90d": "statistics.range90d",
  "12m": "statistics.range12m",
  all: "statistics.rangeAll",
} as const;

/** A tile's key under statistics.* in the i18n files: what it counts. */
export type StatisticsTile =
  | "answers"
  | "studyDays"
  | "cards"
  | "cardsYouKnow"
  | "currentStreak"
  | "longestStreak"
  | "young"
  | "mature"
  | "quizAccuracy"
  | "overdue";

/** How many prompts are new, relearning, young and mature: a bidirectional deck counts each card twice. */
export interface Maturity {
  new: number;
  /** Forgotten last time and not remembered since. */
  relearning: number;
  young: number;
  mature: number;
}

/** A row of "By deck"; a figure left out is not checked, `null` is a dash (none to count). */
export interface DeckRow {
  name: string;
  answers: number;
  introduced?: number;
  /** Young and mature recall: reviews remembered of reviews; null for none, so not shown. */
  young?: { recalled: number; reviews: number } | null;
  mature?: { recalled: number; reviews: number } | null;
  /** Recall each way, shown only with reviews both ways: null without. */
  directions?: null;
  /** First try: new cards remembered of new cards. */
  firstTry?: { recalled: number; introduced: number } | null;
  lapses?: number;
  /** Graded course answers: right of answers. */
  quiz?: { right: number; answers: number } | null;
  /** "today" is today's study day. */
  lastStudied?: "today";
}

/** A day's row of "What each day held". */
export interface DayHeld {
  answers: number;
  introduced: number;
  /** Reviews remembered. */
  remembered: number;
  lapses: number;
  repeats: number;
}

/** How many answers each button got. */
export interface Buttons {
  again: number;
  hard: number;
  good: number;
  easy: number;
}

/** What the statistics should say; left out, a tile, a chart or the table is not checked. */
export interface ExpectedStatistics {
  answers?: number;
  studyDays?: number;
  cards?: number;
  /** Prompts mature now, from where the cards stand. */
  cardsYouKnow?: number;
  /** In days: shown as "1 day", "2 days". */
  currentStreak?: number;
  longestStreak?: number;
  /** Reviews remembered, young and mature apart; null for "No reviews yet". */
  young?: { recalled: number; reviews: number } | null;
  mature?: { recalled: number; reviews: number } | null;
  /**
   * Where the answer log begins, said in a note when it begins inside the
   * months read: "thisMonth" for a log begun in the current month.
   */
  coverage?: "thisMonth";
  /** Every deck's block under "By deck", in any order. */
  decks?: DeckRow[];
  /** Today's row of "What each day held". */
  today?: DayHeld;
  /** The answer buttons pressed, for first answers and young and mature reviews. */
  buttons?: { first: Buttons; young: Buttons; mature: Buttons };
  /**
   * Today's weekday in "Answers by weekday": its answers on average, and
   * how many of that weekday were studied of those there were.
   */
  weekday?: { average: number; studied: number; of: number };
  /**
   * The total of "Answers by hour of the day", opened from its fold, with
   * the time spent studying above it: never its minutes, which hang on
   * how fast the journey runs.
   */
  hours?: number;
  /**
   * "Recall by interval", every span of intervals in order: the reviews
   * remembered of its reviews, null for "no reviews".
   */
  recallByInterval?: ({ recalled: number; reviews: number } | null)[];
  /** The newest week of "Young and mature cards over time": its prompts young, mature and relearning. */
  thisWeek?: { young: number; mature: number; relearning: number };
  /**
   * The instance's prompts taken together, under "Where your cards stand",
   * with the forecast beside them, and how their intervals are spread once
   * any is studied.
   */
  maturity?: Maturity;
  /** The prompts due before today, in the tile under the maturity bar. */
  overdue?: number;
  /** Every deck under "Maturity by deck", in any order. */
  maturityByDeck?: ({ name: string } & Maturity)[];
  /**
   * The fronts listed under "Leeches across your decks", in order; none
   * when no card was forgotten that often, which the page says; null
   * when there is no review yet, so nothing is hard to tell and no list
   * is shown.
   */
  leeches?: string[] | null;
}

/**
 * "Statistics", of the instance or of one deck: the range the figures
 * are of and four tabs. The overview's tiles, calendar and figures by
 * deck; the activity's charts of each day, the weekdays, the time spent
 * and the hours of the day, the cards introduced and where they stood
 * week by week; the memory's recall,
 * answer buttons, recall by interval and what is hard; and
 * the cards' tab, where the cards stand, read apart, and the courses.
 * It opens on the overview of the last 3 months.
 */
export class Statistics extends Screen {
  private get main(): Locator {
    return this.page.getByRole("main");
  }

  private get byDeck(): Locator {
    return this.main.getByRole("list", { name: this.t("statistics.byDeck"), exact: true });
  }

  /**
   * A headline tile, named by its label: the first so named, as this
   * week's and this month's tiles, further down, share some labels.
   */
  tile(key: StatisticsTile): Locator {
    return this.main.getByRole("group", { name: this.t(`statistics.${key}`), exact: true }).first();
  }

  /** Opens Statistics from the instance's links and waits for them to be read. */
  async open(): Promise<void> {
    await this.intent("Open Statistics", async () => {
      await this.app.chrome.openStatistics();
      await this.expectRead();
    });
  }

  /**
   * Opens a deck's own statistics from its page ("More statistics"),
   * under the deck in the breadcrumbs, and waits for them to be read.
   */
  async openForDeck(name: string): Promise<void> {
    await this.intent(`Open the statistics of ${name}`, async () => {
      await this.app.chrome.breadcrumb("breadcrumbs.decks");
      await this.app.decks.openDeck(name);
      await this.main
        .getByRole("link", { name: this.t("statistics.moreStatistics"), exact: true })
        .click();
      await expect(
        this.page.getByRole("navigation", { name: this.t("breadcrumbs.label") }).getByRole("link"),
      ).toHaveText([this.t("breadcrumbs.decks"), name, this.t("breadcrumbs.statistics")]);
      await this.expectRead();
    });
  }

  /** Shows a tab, by its name, and waits for it to be the one shown. */
  async openTab(tab: StatisticsTab): Promise<void> {
    await this.intent(`Open the statistics' ${tab} tab`, async () => {
      const link = this.main.getByRole("tab", { name: this.t(TAB_NAMES[tab]), exact: true });
      await link.click();
      await expect(link).toHaveAttribute("aria-selected", "true");
      await expect(
        this.main.getByRole("tabpanel", { name: this.t(TAB_NAMES[tab]), exact: true }),
      ).toBeVisible();
    });
  }

  /** Picks the range the figures are of, by its name, and waits for the overview to be read again. */
  async selectRange(range: StatisticsRange): Promise<void> {
    await this.intent(`Show the statistics of ${range}`, async () => {
      await this.main
        .getByRole("combobox", { name: this.t("statistics.range"), exact: true })
        .selectOption({ label: this.t(RANGE_NAMES[range]) });
      await expect(this.page).toHaveURL(
        range === "90d" ? /#\/(deck-)?statistics\?(?!.*range=)/ : new RegExp(`range=${range}`),
      );
    });
  }

  /** The heading, then on the overview its first tile or the word that there is none yet. */
  private async expectRead(): Promise<void> {
    await expect(
      this.page.getByRole("heading", {
        name: this.t("statistics.heading"),
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await expect(
      this.main.getByText(this.t("statistics.empty"), { exact: true }).or(this.tile("answers")),
    ).toBeVisible();
  }

  /**
   * Graded course answers, apart from recall: their tile, and no recall
   * tiles while there is no review to count (course answers are none).
   */
  async expectCourseAnswersOnly(): Promise<void> {
    await this.intent("Check that course answers are counted apart from recall", async () => {
      await this.openTab("memory");
      await expect(this.tile("quizAccuracy").getByRole("strong")).toHaveText(/\d/);
      await expect(this.tile("young")).toHaveCount(0);
      await expect(this.tile("mature")).toHaveCount(0);
    });
  }

  /**
   * Under "Your courses", the course (its title, a link to its page) with
   * one chapter done of all, and its row for `chapter`: done, with a share
   * of its graded course answers right.
   */
  async expectCourseChapter(course: string, chapter: string): Promise<void> {
    await this.intent("Check the course's chapter done and its graded answers", async () => {
      await this.openTab("cards");
      const section = this.main.getByRole("region", {
        name: this.t("statistics.courses"),
        exact: true,
      });
      await expect(section.getByRole("link", { name: course, exact: true })).toBeVisible();
      const bar = section.getByRole("progressbar", { name: course, exact: true });
      await expect(bar).toHaveAttribute("value", "1");
      const count = Number(await bar.getAttribute("max"));
      await expect(
        section.getByText(this.t("course.chaptersDone", { done: 1, count }), { exact: true }),
      ).toBeVisible();
      const table = section.getByRole("region", { name: course, exact: true }).getByRole("table");
      const row = table
        .getByRole("row")
        .filter({ has: this.page.getByRole("rowheader", { name: chapter, exact: true }) });
      await expect(
        await cellOf(table, row, this.t("statistics.chapterState")),
        this.t("statistics.chapterState"),
      ).toHaveText(this.t("course.done"));
      await expect(
        await cellOf(table, row, this.t("statistics.quizAccuracy")),
        this.t("statistics.quizAccuracy"),
      ).toHaveText(/\d/);
    });
  }

  /**
   * The overview's calendar from the keyboard alone: focused, End points
   * at today, which the line under it and its status line both say,
   * `answers` answers of it, and Escape lets go.
   */
  async expectCalendarByKeyboard(answers: number): Promise<void> {
    await this.intent("Read today in the calendar with the keyboard", async () => {
      await this.openTab("overview");
      const figure = this.figure(this.t("statistics.activity", { weeks: 52 }));
      const grid = figure.getByRole("img", {
        name: this.t("statistics.activityLabel", { weeks: 52 }),
        exact: true,
      });
      // The pointer, left where the last click was, could rest on a day and speak over the keys.
      await this.page.mouse.move(0, 0);
      await grid.focus();
      await this.page.keyboard.press("End");
      const said = new RegExp(
        `^${escapeRegExp(`${await this.today()}: ${this.t("statistics.answerCount", { count: answers })}`)} `,
      );
      await expect(figure.getByRole("status")).toHaveText(said);
      await expect(figure.getByText(said)).toHaveCount(2);
      await this.page.keyboard.press("Escape");
      await expect(figure.getByRole("status")).toHaveText("");
    });
  }

  /** The value a tile shows ("4", "1 day", "75 %", "–"). */
  async value(key: StatisticsTile): Promise<string> {
    return (await this.tile(key).getByRole("strong").innerText()).trim();
  }

  /** No answers yet: the statistics say so, and show no tiles. */
  async expectEmpty(): Promise<void> {
    await this.intent("Check that there are no statistics yet", async () => {
      await expect(this.main.getByText(this.t("statistics.empty"), { exact: true })).toBeVisible();
      await expect(this.tile("answers")).toHaveCount(0);
    });
  }

  /**
   * Checks what is expected, tab by tab (each opened in turn, so the
   * overview's last), on the figures' range as it is.
   */
  async expectStatistics(expected: ExpectedStatistics): Promise<void> {
    await this.intent("Check the statistics", async () => {
      await this.expectActivityTab(expected);
      await this.expectMemoryTab(expected);
      await this.expectCardsTab(expected);
      // What is hard is read with where the cards stand, so after it is shown.
      await this.openTab("memory");
      if (expected.leeches !== undefined) await this.expectLeeches(expected.leeches);
      await this.expectOverviewTab(expected);
    });
  }

  /** The activity tab's part of `expectStatistics`. */
  private async expectActivityTab(expected: ExpectedStatistics): Promise<void> {
    await this.openTab("activity");
    if (expected.answers !== undefined) await this.expectIntroduced();
    if (expected.today !== undefined) await this.expectToday(expected.today);
    if (expected.weekday !== undefined) await this.expectWeekday(expected.weekday);
    if (expected.hours !== undefined) await this.expectHours(expected.hours);
    if (expected.thisWeek !== undefined) await this.expectThisWeek(expected.thisWeek);
  }

  /** The memory tab's part of `expectStatistics`, but for what is hard. */
  private async expectMemoryTab(expected: ExpectedStatistics): Promise<void> {
    await this.openTab("memory");
    for (const key of ["young", "mature"] as const) {
      const recall = expected[key];
      if (recall !== undefined) await this.expectRecall(key, recall);
    }
    if (expected.buttons !== undefined) await this.expectButtons(expected.buttons);
    if (expected.recallByInterval !== undefined)
      await this.expectRecallByInterval(expected.recallByInterval);
  }

  /** The cards tab's part of `expectStatistics`. */
  private async expectCardsTab(expected: ExpectedStatistics): Promise<void> {
    await this.openTab("cards");
    if (expected.maturity !== undefined) await this.expectMaturity(expected.maturity);
    if (expected.overdue !== undefined) await this.expectValue("overdue", String(expected.overdue));
    if (expected.maturityByDeck !== undefined)
      await this.expectMaturityByDeck(expected.maturityByDeck);
  }

  /** The overview's part of `expectStatistics`. */
  private async expectOverviewTab(expected: ExpectedStatistics): Promise<void> {
    await this.openTab("overview");
    const counts = {
      answers: expected.answers,
      studyDays: expected.studyDays,
      cards: expected.cards,
      cardsYouKnow: expected.cardsYouKnow,
    } as const;
    for (const [key, count] of Object.entries(counts)) {
      if (count !== undefined) await this.expectValue(key as StatisticsTile, String(count));
    }
    const streaks = {
      currentStreak: expected.currentStreak,
      longestStreak: expected.longestStreak,
    } as const;
    for (const [key, days] of Object.entries(streaks)) {
      if (days !== undefined)
        await this.expectValue(
          key as StatisticsTile,
          this.t("statistics.dayCount", { count: days }),
        );
    }
    if (expected.coverage !== undefined) await this.expectCoverage();
    if (expected.decks !== undefined) await this.expectByDeck(expected.decks);
  }

  /**
   * Over all time, the overview's cards introduced and grown mature, each
   * prompt once, the answers of the whole log, and its time studied, a
   * time recorded since today: never how long, which hangs on how fast
   * the journey runs.
   */
  async expectAllTime(expected: { answers: number; introduced: number; matured: number }) {
    await this.intent("Check the statistics of all time", async () => {
      await this.openTab("overview");
      await this.expectValue("answers", String(expected.answers));
      await expect(
        this.main.getByRole("heading", { name: this.t("statistics.allTime"), exact: true }),
      ).toBeVisible();
      for (const [key, count] of [
        ["statistics.promptsIntroduced", expected.introduced],
        ["statistics.promptsMatured", expected.matured],
      ] as const) {
        await expect(
          this.main.getByRole("group", { name: this.t(key), exact: true }).getByRole("strong"),
          this.t(key),
        ).toHaveText(String(count));
      }
      const time = this.main.getByRole("group", {
        name: this.t("statistics.timeStudied"),
        exact: true,
      });
      await expect(time.getByRole("strong"), this.t("statistics.timeStudied")).not.toHaveText("–");
      await expect(time).toContainText(
        this.t("statistics.timeRecordedSince", { date: await this.today() }),
      );
    });
  }

  /**
   * On a deck's own statistics: the overview without the figures by deck,
   * and the activity of the deck's answers alone, `answers` of them today.
   */
  async expectDeckStatistics(answers: number): Promise<void> {
    await this.intent("Check a deck's own statistics", async () => {
      await this.openTab("overview");
      await this.expectValue("answers", String(answers));
      await expect(this.byDeck).toHaveCount(0);
      await this.openTab("activity");
      const table = await this.tableOf(this.t("statistics.dayHeld", { count: 30 }));
      const row = table.getByRole("row").filter({
        has: this.page.getByRole("cell", { name: await this.today(), exact: true }),
      });
      await expect(await cellOf(table, row, this.t("statistics.answers"))).toHaveText(
        String(answers),
      );
    });
  }

  /**
   * Downloads the range's answers from the overview (a CSV file) and
   * checks that each of the `answers`, every one given in study, kept how
   * long recalling and grading took, in whole milliseconds, and the
   * device's offset from UTC; and that `reviewed` of them, given to a
   * card met before, kept the day it was due.
   */
  async expectAnswersTimed(expected: { answers: number; reviewed: number }): Promise<void> {
    await this.intent("Check that each answer kept how long it took", async () => {
      await this.openTab("overview");
      const downloaded = this.page.waitForEvent("download");
      await this.main
        .getByRole("button", { name: this.t("statistics.downloadAnswers"), exact: true })
        .click();
      const download = await downloaded;
      const path = test.info().outputPath(download.suggestedFilename());
      await download.saveAs(path);
      // No field of these answers holds a comma or a quote, so a line splits at each comma.
      const [header, ...rows] = (await readFile(path, "utf8"))
        .trimEnd()
        .split("\r\n")
        .map((line) => line.split(","));
      const column = (name: string) => rows.map((row) => row[header!.indexOf(name)]);
      expect(rows).toHaveLength(expected.answers);
      for (const name of ["recall_millis", "grade_millis"])
        expect(column(name), name).toEqual(rows.map(() => expect.stringMatching(/^\d+$/)));
      expect(column("utc_offset_minutes")).toEqual(
        rows.map(() => expect.stringMatching(/^-?\d+$/)),
      );
      expect(column("prior_due").filter((day) => day !== "")).toEqual(
        Array.from({ length: expected.reviewed }, () =>
          expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        ),
      );
    });
  }

  /** A chart, named by its caption. */
  private figure(caption: string): Locator {
    return this.main.getByRole("figure", { name: caption, exact: true });
  }

  /** A chart's table, named by the chart's caption, opened ("Show as a table"). */
  private async tableOf(caption: string): Promise<Locator> {
    const figure = this.figure(caption);
    const details = figure.locator("details");
    if ((await details.getAttribute("open")) === null)
      await details.getByText(this.t("statistics.showTable"), { exact: true }).click();
    return figure.getByRole("table");
  }

  /** Today's row of "What each day held", found by today's date. */
  private async expectToday(expected: DayHeld): Promise<void> {
    const table = await this.tableOf(this.t("statistics.dayHeld", { count: 30 }));
    const row = table.getByRole("row").filter({
      has: this.page.getByRole("cell", { name: await this.today(), exact: true }),
    });
    const columns = {
      answers: "statistics.answers",
      introduced: "statistics.introduced",
      remembered: "statistics.rememberedColumn",
      lapses: "statistics.lapses",
      repeats: "statistics.repeats",
    } as const;
    for (const [figure, key] of Object.entries(columns)) {
      await expect(
        await cellOf(table, row, this.t(key)),
        `${this.t("statistics.dayHeld", { count: 30 })}: ${this.t(key)}`,
      ).toHaveText(String(expected[figure as keyof DayHeld]));
    }
  }

  /** The answer buttons' table: each count, with its share of its row when there is any. */
  private async expectButtons(expected: {
    first: Buttons;
    young: Buttons;
    mature: Buttons;
  }): Promise<void> {
    const table = await this.tableOf(this.t("statistics.buttons"));
    const kinds = {
      first: "statistics.buttonsFirst",
      young: "statistics.youngShort",
      mature: "statistics.matureShort",
    } as const;
    for (const [kind, key] of Object.entries(kinds)) {
      const counts = expected[kind as keyof typeof kinds];
      const total = counts.again + counts.hard + counts.good + counts.easy;
      const row = table
        .getByRole("row")
        .filter({ has: this.page.getByRole("rowheader", { name: this.t(key), exact: true }) });
      for (const button of ["again", "hard", "good", "easy"] as const) {
        const count = counts[button];
        await expect(
          await cellOf(table, row, this.t(`study.minimal.${button}`)),
          `${this.t("statistics.buttons")}: ${this.t(key)}, ${this.t(`study.minimal.${button}`)}`,
        ).toHaveText(
          count === 0
            ? "0"
            : this.t("statistics.buttonCell", { count, percent: this.percent(count, total) }),
        );
      }
    }
  }

  /** Today's weekday's row of "Answers by weekday". */
  private async expectWeekday(expected: {
    average: number;
    studied: number;
    of: number;
  }): Promise<void> {
    const table = await this.tableOf(this.t("statistics.weekdays"));
    const weekday = await this.page.evaluate(
      (locale) => new Date().toLocaleDateString(locale, { weekday: "long" }),
      this.app.locale,
    );
    const row = table.getByRole("row").filter({
      has: this.page.getByRole("cell", { name: weekday, exact: true }),
    });
    const average = new Intl.NumberFormat(this.app.locale, { maximumFractionDigits: 1 });
    await expect(
      await cellOf(table, row, this.t("statistics.averageAnswers")),
      this.t("statistics.averageAnswers"),
    ).toHaveText(average.format(expected.average));
    await expect(
      await cellOf(table, row, this.t("statistics.studied")),
      this.t("statistics.studied"),
    ).toHaveText(this.t("statistics.studiedOf", { studied: expected.studied, count: expected.of }));
  }

  /**
   * The time spent studying, its sessions a count, and "Answers by hour
   * of the day", opened from its fold: an hour a row, and their total.
   */
  private async expectHours(total: number): Promise<void> {
    await expect(
      this.main.getByRole("heading", { name: this.t("statistics.studyTime"), exact: true }),
    ).toBeVisible();
    await expect(
      this.main
        .getByRole("group", { name: this.t("statistics.sessions"), exact: true })
        .getByRole("strong"),
      this.t("statistics.sessions"),
    ).toHaveText(/^\d+$/);
    await this.main.getByText(this.t("statistics.showHours"), { exact: true }).click();
    const table = await this.tableOf(this.t("statistics.hours"));
    const rows = table.getByRole("row").filter({ has: this.page.getByRole("cell") });
    // 24 hours and the total.
    await expect(rows, this.t("statistics.hours")).toHaveCount(25);
    const row = table.getByRole("row").filter({
      has: this.page.getByRole("rowheader", { name: this.t("statistics.total"), exact: true }),
    });
    await expect(
      await cellOf(table, row, this.t("statistics.answers")),
      `${this.t("statistics.hours")}: ${this.t("statistics.total")}`,
    ).toHaveText(String(total));
  }

  /** What a maturity bar's picture says of its counts: "0 new, 0 relearning, 4 young and 0 mature." */
  private maturityLabel(maturity: Maturity): string {
    return this.t("statistics.maturityLabel", {
      new: this.t("statistics.maturityNew", { count: maturity.new }),
      relearning: this.t("statistics.maturityRelearning", { count: maturity.relearning }),
      young: this.t("statistics.maturityYoung", { count: maturity.young }),
      mature: this.t("statistics.maturityMature", { count: maturity.mature }),
    });
  }

  /** Each row of "Recall by interval": its share of reviews remembered with their count, however few. */
  private async expectRecallByInterval(
    spans: ({ recalled: number; reviews: number } | null)[],
  ): Promise<void> {
    const table = await this.tableOf(this.t("statistics.recallByInterval"));
    const rows = table.getByRole("row").filter({ has: this.page.getByRole("cell") });
    await expect(rows, this.t("statistics.recallByInterval")).toHaveCount(spans.length);
    for (const [i, span] of spans.entries())
      await expect(
        await cellOf(table, rows.nth(i), this.t("statistics.recall")),
        `${this.t("statistics.recallByInterval")}: row ${i + 1}`,
      ).toHaveText(
        span === null
          ? this.t("statistics.noReviewsThen")
          : this.t("statistics.recallShare", {
              percent: this.percent(span.recalled, span.reviews),
              count: span.reviews,
            }),
      );
  }

  /** The newest row of "Young and mature cards over time": this week's. */
  private async expectThisWeek(week: {
    young: number;
    mature: number;
    relearning: number;
  }): Promise<void> {
    const table = await this.tableOf(this.t("statistics.maturityOverTime"));
    const row = table
      .getByRole("row")
      .filter({ has: this.page.getByRole("cell") })
      .first();
    const columns = {
      young: "statistics.youngShort",
      mature: "statistics.matureShort",
      relearning: "statistics.relearningShort",
    } as const;
    for (const [kind, key] of Object.entries(columns))
      await expect(
        await cellOf(table, row, this.t(key)),
        `${this.t("statistics.maturityOverTime")}: ${this.t(key)}`,
      ).toHaveText(String(week[kind as keyof typeof columns]));
  }

  /** The chart of cards introduced over time, which comes with answers. */
  private async expectIntroduced(): Promise<void> {
    await expect(
      this.main.getByRole("img", { name: this.t("statistics.introducedLabel"), exact: true }),
    ).toBeVisible();
  }

  /**
   * The overall maturity bar and the forecast of the next 30 days, which
   * show before any answer too; then, once a prompt is studied, how the
   * intervals are spread, with the eases folded away under them.
   */
  private async expectMaturity(maturity: Maturity): Promise<void> {
    const bar = this.figure(this.t("statistics.maturity")).getByRole("img");
    await expect(bar, this.t("statistics.maturity")).toHaveAccessibleName(
      this.maturityLabel(maturity),
    );
    await expect(
      this.main.getByRole("img", {
        name: this.t("statistics.forecastLabel", { count: 30 }),
        exact: true,
      }),
    ).toBeVisible();
    const studied = maturity.relearning + maturity.young + maturity.mature > 0;
    await expect(
      this.main.getByRole("img", { name: this.t("statistics.intervalsLabel"), exact: true }),
    ).toHaveCount(studied ? 1 : 0);
    await expect(this.main.getByText(this.t("statistics.showEases"), { exact: true })).toHaveCount(
      studied ? 1 : 0,
    );
  }

  private async expectMaturityByDeck(decks: ({ name: string } & Maturity)[]): Promise<void> {
    const list = this.main.getByRole("list").filter({ has: this.page.getByRole("figure") });
    await expect(list.getByRole("listitem"), this.t("statistics.maturityByDeck")).toHaveCount(
      decks.length,
    );
    for (const deck of decks) {
      const bar = list.getByRole("figure", { name: deck.name, exact: true }).getByRole("img");
      await expect(
        bar,
        `${this.t("statistics.maturityByDeck")}: ${deck.name}`,
      ).toHaveAccessibleName(this.maturityLabel(deck));
    }
  }

  /** The leeches' list, read with where the cards stand (so after it is shown). */
  private async expectLeeches(fronts: string[] | null): Promise<void> {
    const list = this.main.getByRole("list", { name: this.t("statistics.leeches"), exact: true });
    if (fronts === null) {
      await expect(list, this.t("statistics.leeches")).toHaveCount(0);
      return;
    }
    if (fronts.length === 0) {
      await expect(list, this.t("statistics.leeches")).toHaveCount(0);
      await expect(
        this.main.getByText(this.t("statistics.noLeeches"), { exact: true }),
        this.t("statistics.leeches"),
      ).toBeVisible();
      return;
    }
    await expect(list.getByRole("listitem").getByRole("link")).toHaveText(fronts);
  }

  /** The note that the figures begin with this month, the log's first. */
  private async expectCoverage(): Promise<void> {
    const month = await this.page.evaluate((locale) => {
      const now = new Date();
      return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toLocaleDateString(locale, {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });
    }, this.app.locale);
    await expect(
      this.main.getByText(this.t("statistics.coverage", { month }), { exact: true }),
    ).toBeVisible();
  }

  private async expectValue(key: StatisticsTile, value: string): Promise<void> {
    await expect(this.tile(key).getByRole("strong"), this.t(`statistics.${key}`)).toHaveText(value);
  }

  private async expectRecall(
    key: "young" | "mature",
    recall: { recalled: number; reviews: number } | null,
  ): Promise<void> {
    if (recall === null) {
      await this.expectValue(key, "–");
      await expect(this.tile(key)).toContainText(this.t("statistics.noReviews"));
      return;
    }
    await this.expectValue(key, this.percent(recall.recalled, recall.reviews));
    await expect(this.tile(key)).toContainText(
      this.t("statistics.ofReviews", { count: recall.reviews }),
    );
  }

  /**
   * Each deck's block under "By deck": its answers and when it was last
   * studied, then each figure given, under its label; a share of none
   * (null) is not shown.
   */
  private async expectByDeck(decks: DeckRow[]): Promise<void> {
    await expect(this.byDeck.getByRole("listitem")).toHaveCount(decks.length);
    const today = await this.today();
    const share = (percent: string, of: string) => `${percent} ${of}`;
    for (const deck of decks) {
      const block = this.byDeck.getByRole("listitem").filter({
        has: this.page.getByRole("heading", { name: deck.name, exact: true }),
      });
      await expect(block.locator(".hint"), `By deck: ${deck.name}`).toHaveText(
        deck.lastStudied === "today"
          ? this.t("statistics.deckAnswered", { count: deck.answers, date: today })
          : textPattern(this.app.locale, "statistics.deckAnswered", { count: deck.answers }),
      );
      const figure = (key: string) =>
        block.locator("dl > div").filter({
          has: this.page.getByRole("term").getByText(this.t(`statistics.${key}`), { exact: true }),
        });
      const expectFigure = async (key: string, value: string | null | undefined) => {
        if (value === undefined) return;
        if (value === null) await expect(figure(key), `${deck.name}: ${key}`).toHaveCount(0);
        else
          await expect(figure(key).getByRole("definition"), `${deck.name}: ${key}`).toHaveText(
            value,
          );
      };
      const recall = (shown?: { recalled: number; reviews: number } | null) =>
        shown == null
          ? shown
          : share(
              this.percent(shown.recalled, shown.reviews),
              this.t("statistics.ofReviews", { count: shown.reviews }),
            );
      await expectFigure("introducedColumn", deck.introduced?.toString());
      await expectFigure("youngRecall", recall(deck.young));
      await expectFigure("matureRecall", recall(deck.mature));
      await expectFigure("directionsColumn", deck.directions);
      await expectFigure(
        "firstTry",
        deck.firstTry == null
          ? deck.firstTry
          : share(
              this.percent(deck.firstTry.recalled, deck.firstTry.introduced),
              this.t("statistics.ofNewCards", { count: deck.firstTry.introduced }),
            ),
      );
      await expectFigure("lapses", deck.lapses?.toString());
      await expectFigure(
        "quizAccuracy",
        deck.quiz == null
          ? deck.quiz
          : share(
              this.percent(deck.quiz.right, deck.quiz.answers),
              this.t("statistics.rightOfAnswers", { count: deck.quiz.answers }),
            ),
      );
    }
  }

  /** Today's study day as the statistics show dates: in the browser's time zone, written as the app writes dates. */
  private async today(): Promise<string> {
    return this.page.evaluate((locale) => {
      const now = new Date();
      const day = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
      return new Date(day).toLocaleDateString(locale, { dateStyle: "long", timeZone: "UTC" });
    }, this.app.locale);
  }
}
