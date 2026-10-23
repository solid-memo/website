// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { deckPreferences } from "@solid-memo/domain/deckPace";
import { activeCards, type Card, type Deck } from "@solid-memo/domain/deck";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { monthOfStudyDay, shiftStudyDay, type Answer } from "@solid-memo/domain/answer";
import { courseProgressOf, type CourseResults } from "@solid-memo/domain/course";
import { answersCsv } from "@solid-memo/domain/answerCsv";
import { statisticsOf, type Statistics } from "@solid-memo/domain/statistics";
import { estimateStudyTime, firstTimedOf } from "@solid-memo/domain/studyTime";
import { historyUrlOf } from "@solid-memo/domain/instanceLayout";
import {
  monthSummaryOf,
  todayFiguresOf,
  withMonthSummaries,
  type MonthSummary,
  type StoredMonthSummary,
  type TodayFigures,
} from "@solid-memo/domain/studyDigest";
import { calendarStartOf } from "@solid-memo/domain/studyPatterns";
import {
  cardAnswers,
  confusionsOf,
  deckAnswers,
  hardestCardsOf,
  lapseIndex,
  type Confusion,
  type HardestCards,
  type LapseIndex,
} from "@solid-memo/domain/cardHistory";
import {
  daysToClearOf,
  easeHistogram,
  FORECAST_DAYS,
  forecastOf,
  freshSchedule,
  intervalHistogram,
  leechesOf,
  overdueOf,
  scheduledStates,
  type Bin,
  type ForecastDay,
} from "@solid-memo/domain/scheduleInsight";
import { cardProgressOf, type CardProgress } from "@solid-memo/domain/cardProgress";
import type {
  DeckLibrary,
  DeckRepository,
  ReviewStateRepository,
  AnswerLog,
  FileExchange,
} from "./ports";
import { readNow } from "./writes";
import { dueStatesOf } from "./answerStore";
import { scheduleFrom } from "./digestStore";
import type { PreferenceStore } from "./preferenceStore";
import type { AnswerStore } from "./answerStore";
import type { DigestStore } from "./digestStore";

export interface StatisticsUseCases {
  /**
   * The study statistics of the answers given in the last `months` study
   * months (12 by default), or, when `range` is given, in its last `range`
   * study days or the whole log ("all"), up to now: of every deck, or of
   * one. Answers still waiting to be added to the log are added first; a
   * month's document is read only when it changed since last read, as
   * loadAnswerLog reads it, which shares what is kept.
   */
  getStatistics(
    instanceUrl: string,
    now: Date,
    options?: StatisticsRange,
  ): Promise<StatisticsReport>;
  /**
   * The today strip's figures (todayFiguresOf) of the answers of the
   * last 12 study months up to now and of the activity calendar's weeks,
   * as getStatistics gives them of that range, answers still waiting to
   * be added to the log added first. A month before this one is
   * summarized from its document once and kept in the instance's digest
   * with its version: it is read again only when it changed (or the pod
   * gave no version), and the summaries learned are written back in the
   * background, those of months no longer looked back over dropped. This
   * month is read as getStatistics reads it. While no time was recorded
   * in those months, the median answer time is estimated from every
   * answer, as getStatistics estimates it, which reads them all.
   */
  getTodayFigures(instanceUrl: string, now: Date): Promise<TodayFigures>;
  /**
   * Save the answers of the range getStatistics would read with the same
   * `options` (every column the log has, answersCsv) as a CSV file on the
   * learner's device, "solid-memo-answers-<study day>.csv": they are
   * handed to the browser to save and sent nowhere. Reads the months as
   * getStatistics does, sharing what is kept.
   */
  saveAnswers(instanceUrl: string, now: Date, options?: StatisticsRange): Promise<void>;
  /**
   * Every answer of the instance's log, of every month, answers still
   * waiting to be added to it added first. Each month's document is read
   * once a call, and only when it changed since it was last read (by its
   * version, kept in this page with the month's answers, for
   * getStatistics too).
   */
  loadAnswerLog(instanceUrl: string): Promise<Answer[]>;
  /**
   * What the Studio's schedule screen shows of a deck (domain/scheduleInsight.ts),
   * as of `now` with the instance's preferences `prefs`: the reviews of
   * the next FORECAST_DAYS study days, capped by the deck's pace (else
   * the preferences'), from the deck's schedule in the digest while it
   * was computed from the documents as they are, else from them (and the
   * digest is brought up to date); how its prompts' intervals and eases
   * are spread; and its lapses and leeches, from the answer log. Writes
   * nothing to the deck.
   */
  deckInsight(
    instanceUrl: string,
    deck: Deck,
    now: Date,
    prefs: StudyPreferences,
  ): Promise<DeckInsight>;
  /** The answers of one card of the deck (by its id), newest first, from the answer log. */
  cardAnswers(instanceUrl: string, deck: Deck, cardId: string): Promise<Answer[]>;
  /**
   * How far along each deck's prompts are now (cardProgressOf), how
   * their intervals and eases are spread, and the reviews of its next
   * FORECAST_DAYS study days (forecastOf, capped by the deck's pace, else
   * the preferences'), with what is overdue and how long the cap takes to
   * let through what it holds back; and, from the answers of the last
   * twelve study months, which of its cards in use were forgotten most
   * (hardestCardsOf) and which wrong options were chosen most
   * (confusionsOf): of every deck of the instance, or of the one given.
   * Reads each deck's cards and review states once, and keeps its
   * schedule in the digest while at it; the log's months as
   * getStatistics reads them, sharing what is kept.
   */
  getCardProgress(
    instanceUrl: string,
    now: Date,
    options?: { deck?: Deck },
  ): Promise<CardProgressReport>;
  /**
   * How each course of `courses` (the instance's decks that are copies of
   * a course, in the order given) has gone: its chapters completed, as
   * its deck says, and its graded course answers chapter by chapter
   * (courseProgressOf), from the answers of the last twelve study months,
   * which the log's months are read for as getStatistics reads them,
   * sharing what is kept. The outline is its release's, read once (the
   * library keeps it); a course whose outline cannot be read is left out.
   * Reads nothing for no course.
   */
  getCourseStatistics(
    instanceUrl: string,
    now: Date,
    courses: readonly Deck[],
  ): Promise<CourseStatistics[]>;
}

/** What the Studio's schedule screen shows of a deck (StatisticsUseCases.deckInsight). */
export interface DeckInsight {
  /** The study day it is of. */
  today: string;
  /** The reviews a day the forecast is capped at: the deck's pace, else the instance's. */
  maxReviewsPerDay: number;
  /** The next FORECAST_DAYS study days, today's first. */
  forecast: ForecastDay[];
  /** The review states of the deck's cards in use, in the directions it studies. */
  scheduled: number;
  intervals: Bin[];
  eases: Bin[];
  /** How often each card was forgotten, by its IRI in the deck's cards document now. */
  lapses: LapseIndex;
  /** The deck's cards in use forgotten LEECH_LAPSES times or more, the most forgotten first. */
  leeches: { card: Card; lapses: number }[];
}

/**
 * Which answers of the log the statistics are of (StatisticsUseCases.getStatistics):
 * those of the last `months` study months (12 by default), or, when
 * `range` is given, of its last `range` study days or the whole log
 * ("all"); of every deck, or of the one `deckUrl` names.
 */
export interface StatisticsRange {
  months?: number;
  range?: number | "all";
  deckUrl?: string;
}

/** The study statistics of a range of the answer log (StatisticsUseCases.getStatistics). */
export interface StatisticsReport extends Statistics {
  /**
   * The study month ("YYYY-MM") the log begins with, when the range asked
   * for begins before it (always so for the whole log): the figures cover
   * only the months since. null when the log reaches back past the range,
   * or has no month.
   */
  coverage: string | null;
  /** The study month ("YYYY-MM") the log begins with; null for a log with no month. */
  logBegins: string | null;
  /** The hour the learner's study day begins (Preferences.dayBoundaryHour), where the hours of the day start. */
  dayBoundaryHour: number;
}

/** How one course has gone (StatisticsUseCases.getCourseStatistics). */
export interface CourseStatistics extends CourseResults {
  /** The course's deck in the instance. */
  deck: Deck;
}

/** How far along decks' prompts are (StatisticsUseCases.getCardProgress). */
export interface CardProgressReport {
  /** The study day it is: the forecasts' first. */
  today: string;
  /** Each deck's figures, as its own caps make them. */
  decks: DeckProgress[];
}

/** Where one deck's prompts stand, and its reviews to come (CardProgressReport). */
export interface DeckProgress {
  deck: Deck;
  /** Its prompts by stage. */
  progress: CardProgress;
  /** The reviews of its next FORECAST_DAYS study days (forecastOf). */
  forecast: ForecastDay[];
  /** How its scheduled prompts' intervals and eases are spread (intervalHistogram, easeHistogram). */
  intervals: Bin[];
  eases: Bin[];
  /** Its prompts due before today (overdueOf). */
  overdue: number;
  /** The study days after today its cap takes to let through the reviews it holds back (daysToClearOf); null: more than the forecast's. */
  daysToClear: number | null;
  /** The new prompts it introduces a day: its own cap, else the preferences'. */
  newCardsPerDay: number;
  /** Its prompts first reviewed today, which that cap counts (newCardsRunOutOf). */
  introducedToday: number;
  /** Its cards in use forgotten in reviews of the last twelve study months, the hardest first, and the reviews of those months. */
  hardest: HardestCards<Card>;
  /** Its multiple-choice answers of those months. */
  courseAnswers: number;
  /** The wrong options chosen in them, with their cards in use, the most chosen first. */
  confusions: Confusion<Card>[];
}

/** The first study day of the month of `today` and of the `months - 1` before it. */
function firstDayOfMonths(today: string, months: number): string {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - months, 1)).toISOString().slice(0, 10);
}

/**
 * What the learner's answers and schedules say (docs/statistics.md): the
 * statistics of a range of the answer log, saved as a file too, how far
 * along each deck's prompts are and what is due, a deck's schedule and its
 * hardest cards, a card's answers, and how each course has gone.
 */
export function createStatisticsUseCases({
  answerLog,
  deckRepository,
  reviewStateRepository,
  deckLibrary,
  fileExchange,
  preferenceStore,
  answerStore,
  digestStore,
}: {
  answerLog: AnswerLog;
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  deckLibrary: DeckLibrary;
  fileExchange: FileExchange;
  preferenceStore: Pick<PreferenceStore, "get">;
  answerStore: Pick<AnswerStore, "flush" | "readMonths" | "loadAll">;
  digestStore: Pick<DigestStore, "of" | "recordSchedule" | "remember">;
}): StatisticsUseCases {
  /**
   * The answers of a range of the log up to `at` (StatisticsRange), of
   * every deck or of one, answers still waiting to be added to it added
   * first; with the study day it ends on, the months the log lists, the
   * range's first study day and the first month it takes in (null for
   * the whole log). With `recent`, the answers of the activity
   * calendar's weeks come too, where the range begins after them
   * (statisticsOf's figures up to today), and the first answer read
   * with a recorded time, of every deck: since when the app records
   * times, though one deck's were recorded later.
   */
  async function rangeAnswers(
    instanceUrl: string,
    at: Date,
    { months = 12, range, deckUrl }: StatisticsRange,
    recent = false,
  ): Promise<{
    answers: Answer[];
    today: string;
    logged: readonly string[];
    first: string | null;
    firstMonth: string | null;
    firstTimed: Answer | undefined;
    dayBoundaryHour: number;
  }> {
    await answerStore.flush();
    const [prefs, logged] = await Promise.all([
      preferenceStore.get(instanceUrl),
      answerLog.months(instanceUrl),
    ]);
    const today = studyDayOf(at, prefs.dayBoundaryHour);
    // The range's first study day: of `range` days up to today, or the first
    // of this month and the `months - 1` before it; none for the whole log.
    const first =
      range === "all"
        ? null
        : range === undefined
          ? firstDayOfMonths(today, months)
          : shiftStudyDay(today, 1 - range);
    const firstMonth = first === null ? null : monthOfStudyDay(first);
    const calendarStart = calendarStartOf(today);
    const from = first === null || !recent || first <= calendarStart ? first : calendarStart;
    const fromMonth = from === null ? null : monthOfStudyDay(from);
    const read = await answerStore.readMonths(
      instanceUrl,
      logged,
      (logMonth) => fromMonth === null || logMonth >= fromMonth,
    );
    const answers = read.filter(
      (answer) =>
        (from === null || answer.studyDay >= from) &&
        (deckUrl === undefined || answer.deckUrl === deckUrl),
    );
    return {
      answers,
      today,
      logged,
      first,
      firstMonth,
      firstTimed: firstTimedOf(read),
      dayBoundaryHour: prefs.dayBoundaryHour,
    };
  }
  /**
   * A deck's cards and review states as they are now, with its schedule:
   * the digest's while it is of these documents, else computed afresh and
   * kept.
   */
  async function scheduleNow(
    instanceUrl: string,
    deck: Deck,
    at: Date,
    prefs: Pick<StudyPreferences, "scheduler" | "dayBoundaryHour">,
  ) {
    const [digest, cards, reviews] = await Promise.all([
      digestStore.of(instanceUrl),
      readNow(deckRepository.readCardsSince(deck, undefined)),
      readNow(reviewStateRepository.readReviewStatesSince(deck, undefined)),
    ]);
    const versions = { cards: cards.version, reviews: reviews.version };
    const today = studyDayOf(at, prefs.dayBoundaryHour);
    let schedule = freshSchedule(digest.schedules[deck.url], versions, {
      direction: deck.direction,
      dayBoundaryHour: prefs.dayBoundaryHour,
      scheduler: prefs.scheduler,
      today,
    });
    if (schedule === null) {
      schedule = scheduleFrom(cards, deck, reviews, prefs, at);
      digestStore.recordSchedule(instanceUrl, deck, cards, reviews, schedule);
    }
    return { cards, reviews, schedule };
  }

  return {
    async getStatistics(instanceUrl, at, options = {}) {
      const { answers, today, logged, first, firstMonth, firstTimed, dayBoundaryHour } =
        await rangeAnswers(instanceUrl, at, options, true);
      const begins = logged[0];
      return {
        ...statisticsOf(answers, today, first ?? undefined, firstTimed),
        coverage:
          begins !== undefined && (firstMonth === null || begins > firstMonth) ? begins : null,
        logBegins: begins ?? null,
        dayBoundaryHour,
      };
    },
    async getTodayFigures(instanceUrl, at) {
      await answerStore.flush();
      const [prefs, logged, digest] = await Promise.all([
        preferenceStore.get(instanceUrl),
        answerLog.months(instanceUrl),
        digestStore.of(instanceUrl),
      ]);
      const today = studyDayOf(at, prefs.dayBoundaryHour);
      const thisMonth = monthOfStudyDay(today);
      // getStatistics' range, and the activity calendar's weeks, which the streaks look back over.
      const first = firstDayOfMonths(today, 12);
      const calendarStart = calendarStartOf(today);
      const fromMonth = monthOfStudyDay(first < calendarStart ? first : calendarStart);
      const kept: Record<string, StoredMonthSummary> = {};
      const summaries = await Promise.all(
        logged
          .filter((month) => month >= fromMonth)
          .map(async (month): Promise<MonthSummary> => {
            // This month changes with every answer (a month after it, only when the clock is behind).
            if (month >= thisMonth)
              return monthSummaryOf(
                await answerStore.readMonths(instanceUrl, logged, (m) => m === month),
              );
            const document = historyUrlOf(instanceUrl, month);
            const stored = digest.months[document];
            const since = await answerLog.readMonthSince(instanceUrl, month, stored?.version);
            if (since.unchanged) {
              kept[document] = stored!;
              return stored!.summary;
            }
            const summary = monthSummaryOf(since.value);
            if (since.version !== null)
              kept[document] = { document, version: since.version, summary };
            return summary;
          }),
      );
      const before = Object.values(digest.months);
      if (
        before.length !== Object.keys(kept).length ||
        before.some((stored) => kept[stored.document]?.version !== stored.version)
      )
        digestStore.remember(instanceUrl, (stored) => withMonthSummaries(stored, kept));
      const figures = todayFiguresOf(summaries, today, first);
      if (figures.medianAnswerMs !== null || !figures.days.some((day) => day.studyDay >= first))
        return figures;
      const { answers, firstTimed } = await rangeAnswers(instanceUrl, at, {}, true);
      const ranged = answers.filter((answer) => answer.studyDay >= first);
      return { ...figures, medianAnswerMs: estimateStudyTime(ranged, firstTimed).medianAnswerMs };
    },
    async saveAnswers(instanceUrl, at, options = {}) {
      const { answers, today } = await rangeAnswers(instanceUrl, at, options);
      fileExchange.save(`solid-memo-answers-${today}.csv`, "text/csv", answersCsv(answers));
    },
    loadAnswerLog: answerStore.loadAll,
    async deckInsight(instanceUrl, deck, at, prefs) {
      const today = studyDayOf(at, prefs.dayBoundaryHour);
      const [{ cards, reviews, schedule }, answers] = await Promise.all([
        scheduleNow(instanceUrl, deck, at, prefs),
        answerStore.loadAll(instanceUrl),
      ]);
      const { maxReviewsPerDay } = deckPreferences(prefs, deck);
      const states = scheduledStates(cards.value, deck.direction, reviews.value.sm2);
      const due = scheduledStates(cards.value, deck.direction, dueStatesOf(reviews.value, prefs));
      const lapses = lapseIndex(deckAnswers(answers, deck));
      const live = new Map(activeCards(cards.value).map((card) => [card.url, card]));
      return {
        today,
        maxReviewsPerDay,
        forecast: forecastOf(schedule, { today, days: FORECAST_DAYS, maxReviewsPerDay }),
        scheduled: states.length,
        intervals: intervalHistogram(due),
        eases: easeHistogram(states),
        lapses,
        leeches: leechesOf(lapses).flatMap(({ cardUrl, lapses }) => {
          const card = live.get(cardUrl);
          return card === undefined ? [] : [{ card, lapses }];
        }),
      };
    },
    async cardAnswers(instanceUrl, deck, cardId) {
      return cardAnswers(
        deckAnswers(await answerStore.loadAll(instanceUrl), deck),
        `${deck.cardsDocumentUrl}#${cardId}`,
      );
    },
    async getCardProgress(instanceUrl, at, { deck } = {}) {
      const [prefs, decks] = await Promise.all([
        preferenceStore.get(instanceUrl),
        deck === undefined ? deckRepository.listDecks(instanceUrl) : [deck],
      ]);
      const today = studyDayOf(at, prefs.dayBoundaryHour);
      // The answers of the statistics' twelve study months, by deck: whole
      // months, read beside the decks' cards. Only what is hard needs them,
      // so a log that cannot be read leaves that empty, not the cards' progress.
      const firstMonth = monthOfStudyDay(firstDayOfMonths(today, 12));
      const logged = (async () => {
        await answerStore.flush();
        const byDeck = new Map<string, Answer[]>();
        for (const answer of await answerStore.readMonths(
          instanceUrl,
          await answerLog.months(instanceUrl),
          (month) => month >= firstMonth,
        )) {
          const answers = byDeck.get(answer.deckUrl);
          if (answers === undefined) byDeck.set(answer.deckUrl, [answer]);
          else answers.push(answer);
        }
        return byDeck;
      })().catch(() => new Map<string, Answer[]>());
      const progress = await Promise.all(
        decks.map(async (one) => {
          const [{ cards, reviews, schedule }, byDeck] = await Promise.all([
            scheduleNow(instanceUrl, one, at, prefs),
            logged,
          ]);
          const { maxReviewsPerDay, newCardsPerDay } = deckPreferences(prefs, one);
          const states = scheduledStates(cards.value, one.direction, reviews.value.sm2);
          const due = dueStatesOf(reviews.value, prefs);
          const forecast = forecastOf(schedule, { today, days: FORECAST_DAYS, maxReviewsPerDay });
          const answers = deckAnswers(byDeck.get(one.url) ?? [], one);
          const live = activeCards(cards.value);
          return {
            deck: one,
            progress: cardProgressOf({
              cards: cards.value,
              direction: one.direction,
              reviews: reviews.value.sm2,
              due,
            }),
            forecast,
            intervals: intervalHistogram(scheduledStates(cards.value, one.direction, due)),
            eases: easeHistogram(states),
            overdue: overdueOf(schedule.dueByDay, today),
            daysToClear: daysToClearOf(forecast),
            newCardsPerDay,
            introducedToday: schedule.studyDay === today ? schedule.introducedOnDay : 0,
            hardest: hardestCardsOf(answers, live),
            courseAnswers: answers.filter((answer) => answer.mode === "multiple-choice").length,
            confusions: confusionsOf(answers, live),
          };
        }),
      );
      return { today, decks: progress };
    },
    async getCourseStatistics(instanceUrl, at, courses) {
      if (courses.length === 0) return [];
      await answerStore.flush();
      const [prefs, logged] = await Promise.all([
        preferenceStore.get(instanceUrl),
        answerLog.months(instanceUrl),
      ]);
      const firstMonth = monthOfStudyDay(
        firstDayOfMonths(studyDayOf(at, prefs.dayBoundaryHour), 12),
      );
      const answers = await answerStore.readMonths(
        instanceUrl,
        logged,
        (month) => month >= firstMonth,
      );
      const results = await Promise.all(
        courses.map(async (deck): Promise<CourseStatistics[]> => {
          if (deck.sourceUrl === undefined)
            throw new Error("A course's deck names the release it was copied from");
          const outline = await deckLibrary.fetchCourseOutline(deck.sourceUrl).catch(() => null);
          if (outline === null) return [];
          return [
            {
              deck,
              ...courseProgressOf(
                outline,
                deck.completedChapters ?? [],
                deckAnswers(answers, deck),
              ),
            },
          ];
        }),
      );
      return results.flat();
    },
  };
}
