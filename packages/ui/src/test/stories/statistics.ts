// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DeckProgress, StatisticsReport } from "@solid-memo/application/statistics";
import { shiftStudyDay, type Answer } from "@solid-memo/domain/answer";
import type { HardCard } from "@solid-memo/domain/cardHistory";
import type { Card } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { statisticsOf, type DayActivity } from "@solid-memo/domain/statistics";
import { deckProgressOf } from "../fakes/statistics";
import {
  arabicCard,
  arabicDeck,
  kanjiCards,
  kanjiDeck,
  koreanDeck,
  longTitleDeck,
  storyCard,
  storyInstance,
} from "../storyData";
import { waterDistractors } from "./cards";

/**
 * Data the stories of the statistics share (src/ui/Statistics*.stories.tsx,
 * src/ui/charts/*.stories.tsx): about half a year of study, made up the
 * same way every time from a fixed seed and fixed days, never from the
 * clock, and the figures statisticsOf makes of it. Nothing here is read
 * from or written to a pod.
 */

/** The day the stories' statistics run up to. */
export const STORY_TODAY = "2026-09-21";

/** The first day of the made-up study. */
const FIRST_DAY = "2026-03-02";

/** The first day whose answers carry their own time (vocabulary 1.19). */
const TIMED_FROM = "2026-06-01";

/** A deck since removed from the catalog, whose answers are still in the log. */
export const removedDeckUrl = `${storyInstance.url}catalog.ttl#removed`;

/** Numbers that look random, the same each time: a Park–Miller generator from a fixed seed. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

/** A prompt being learned: its card, its direction and deck, and when it is due next. */
interface Prompt {
  deckUrl: string;
  cardUrl: string;
  direction: Answer["direction"];
  interval: number;
  due: string;
}

/** The grade an answer gets: mostly Good, now and then Again, Hard or Easy. */
function gradeOf(roll: number): Answer["grade"] {
  if (roll < 0.1) return 1;
  if (roll < 0.25) return 3;
  return roll < 0.85 ? 4 : 5;
}

/**
 * Half a year of study of the kanji and the Korean words (both ways),
 * three new prompts a study day and the reviews that fall due, a day
 * skipped now and then; a few course questions of the Arabic deck; and
 * a few answers of a deck since removed. Each day's answers are one
 * session from an hour of its own, their times recorded from June on.
 */
function madeUpAnswers(): Answer[] {
  const random = seeded(20260921);
  const waiting: Prompt[] = [
    ...Array.from({ length: 240 }, (_, i) => ({
      deckUrl: kanjiDeck.url,
      cardUrl: `${kanjiDeck.cardsDocumentUrl}#k${i}`,
      direction: "front-to-back" as const,
      interval: 0,
      due: "",
    })),
    ...Array.from({ length: 120 }, (_, i) => ({
      deckUrl: koreanDeck.url,
      cardUrl: `${koreanDeck.cardsDocumentUrl}#w${i >> 1}`,
      direction: i % 2 === 0 ? ("front-to-back" as const) : ("back-to-front" as const),
      interval: 0,
      due: "",
    })),
  ].sort((a, b) => a.cardUrl.localeCompare(b.cardUrl));
  const learning: Prompt[] = [];
  const answers: Answer[] = [];
  let id = 0;
  for (let day = FIRST_DAY; day <= STORY_TODAY; day = shiftStudyDay(day, 1)) {
    // A day skipped now and then, and two weeks away in July.
    if ((random() < 0.15 || (day >= "2026-07-13" && day <= "2026-07-26")) && day !== STORY_TODAY)
      continue;
    const due = learning.filter((prompt) => prompt.due <= day);
    const fresh = waiting.splice(0, 3);
    for (const prompt of fresh) learning.push(prompt);
    let at = Date.parse(`${day}T${String(7 + Math.floor(random() * 13)).padStart(2, "0")}:00:00Z`);
    const answer = (prompt: Prompt, grade: Answer["grade"], prior: number | undefined) => {
      const millis = 1500 + Math.floor(random() * 9000);
      at += millis + 2000;
      id += 1;
      const next =
        grade < 3 ? 1 : prior === undefined ? grade - 2 : Math.max(2, prior * (grade - 1.6));
      answers.push({
        id: `answer-${id}`,
        deckUrl: prompt.deckUrl,
        cardUrl: prompt.cardUrl,
        direction: prompt.direction,
        grade,
        answeredAt: new Date(at).toISOString(),
        studyDay: day,
        ...(prior === undefined ? {} : { priorIntervalDays: prior }),
        nextIntervalDays: Math.round(next),
        ...(day >= TIMED_FROM ? { recallMillis: millis, gradeMillis: 900 } : {}),
      });
      return Math.round(next);
    };
    for (const prompt of [...due, ...fresh]) {
      const grade = gradeOf(random());
      const prior = prompt.due === "" ? undefined : prompt.interval;
      prompt.interval = answer(prompt, grade, prior);
      // Forgotten: seen again before the day is out.
      if (grade < 3) answer(prompt, 4, 1);
      prompt.due = shiftStudyDay(day, prompt.interval);
    }
  }
  const courseDays = ["2026-09-08", "2026-09-10", "2026-09-15", "2026-09-17", "2026-09-20"];
  courseDays.forEach((day, i) => {
    for (const [j, grade] of ([5, 5, 1, 5] as const).entries()) {
      answers.push({
        id: `course-${i}-${j}`,
        deckUrl: arabicDeck.url,
        cardUrl: `${arabicDeck.cardsDocumentUrl}#q${j}`,
        direction: "front-to-back",
        grade,
        answeredAt: `${day}T20:0${j}:00.000Z`,
        studyDay: day,
        nextIntervalDays: 1,
        mode: "multiple-choice",
        recallMillis: 4000,
      });
    }
  });
  for (const day of ["2026-04-06", "2026-04-07"]) {
    answers.push({
      id: `removed-${day}`,
      deckUrl: removedDeckUrl,
      cardUrl: `${storyInstance.url}decks/removed.ttl#gone`,
      direction: "front-to-back",
      grade: 4,
      answeredAt: `${day}T09:00:00.000Z`,
      studyDay: day,
      nextIntervalDays: 1,
    });
  }
  return answers;
}

/** The made-up answers, oldest first. */
export const storyAnswers: readonly Answer[] = madeUpAnswers();

/**
 * The report getStatistics gives of the answers given, of the range
 * from `since` (all of them without), up to STORY_TODAY.
 */
export function storyReport(
  answers: readonly Answer[],
  since?: string,
  more: Partial<StatisticsReport> = {},
): StatisticsReport {
  return {
    ...statisticsOf(answers, STORY_TODAY, since),
    coverage: null,
    logBegins: "2026-03",
    dayBoundaryHour: DEFAULT_PREFERENCES.dayBoundaryHour,
    ...more,
  };
}

/** Every deck's statistics over the whole log, which begins in March. */
export const allTimeReport = storyReport(storyAnswers, undefined, { coverage: "2026-03" });

/** Every deck's statistics over the last 30 days. */
export const recentReport = storyReport(storyAnswers, shiftStudyDay(STORY_TODAY, -29));

/** The kanji deck's statistics over the last 90 days. */
export const kanjiReport = storyReport(
  storyAnswers.filter((answer) => answer.deckUrl === kanjiDeck.url),
  shiftStudyDay(STORY_TODAY, -89),
);

/** The Korean deck's statistics, its reviews both ways, over the last 90 days. */
export const koreanReport = storyReport(
  storyAnswers.filter((answer) => answer.deckUrl === koreanDeck.url),
  shiftStudyDay(STORY_TODAY, -89),
);

/** The Arabic deck's statistics: studied only in a course's chapters. */
export const courseOnlyReport = storyReport(
  storyAnswers.filter((answer) => answer.deckUrl === arabicDeck.url),
);

/** A range with no answers, in a log that has some before it. */
export const emptyRangeReport = storyReport([]);

/** A log with no answers at all. */
export const emptyLogReport = storyReport([], undefined, { logBegins: null });

/** The statistics of a log with one answer: today's first card. */
export const firstAnswerReport = storyReport([
  {
    id: "answer-first",
    deckUrl: kanjiDeck.url,
    cardUrl: kanjiCards[0]!.url,
    direction: "front-to-back",
    grade: 4,
    answeredAt: `${STORY_TODAY}T10:00:00.000Z`,
    studyDay: STORY_TODAY,
    nextIntervalDays: 1,
    recallMillis: 3200,
    gradeMillis: 800,
  },
]);

/** A day's activity from its answers, new cards, lapses and repeats; the rest are reviews. */
export function storyDay(
  studyDay: string,
  answers: number,
  introduced: number,
  lapses: number,
  repeats = 0,
): DayActivity {
  return {
    studyDay,
    answers,
    introduced,
    reviews: answers - introduced - repeats,
    lapses,
    repeats,
  };
}

/** Days of a learner who studies thousands of answers a day. */
export const busyDays: DayActivity[] = Array.from({ length: 30 }, (_, i) =>
  storyDay(shiftStudyDay(STORY_TODAY, i - 29), 2400 + ((i * 337) % 900), 200, 180, 40),
);

/** A card hard to remember, forgotten `lapses` times of `reviews`. */
function hard(card: Card, lapses: number, reviews: number): HardCard<Card> {
  return { card, lapses, reviews };
}

/** Kanji forgotten often, two of them leeches. */
const hardKanji: HardCard<Card>[] = [
  hard({ ...kanjiCards[0]!, distractors: waterDistractors }, 6, 14),
  hard(kanjiCards[1]!, 4, 9),
  hard(storyCard(kanjiDeck, "k-tree", { "": "木" }, { en: "tree" }), 2, 11),
  hard(storyCard(kanjiDeck, "k-gold", { "": "金" }, { en: "gold, money" }), 1, 7),
];

/** The kanji deck's progress: studied a while, with hard cards and wrong options chosen. */
export const kanjiProgress: DeckProgress = deckProgressOf(kanjiDeck, {
  progress: { new: 120, relearning: 4, young: 60, mature: 56 },
  hardest: { reviews: 820, cards: hardKanji },
  courseAnswers: 30,
  confusions: [
    {
      card: { ...kanjiCards[0]!, distractors: waterDistractors },
      distractor: waterDistractors[0]!,
      picks: 5,
    },
    {
      card: { ...kanjiCards[0]!, distractors: waterDistractors },
      distractor: waterDistractors[1]!,
      picks: 2,
    },
  ],
});

/** The Arabic deck's progress: a card forgotten in a sentence that runs right to left. */
export const arabicProgress: DeckProgress = deckProgressOf(arabicDeck, {
  progress: { new: 10, relearning: 1, young: 3, mature: 0 },
  hardest: { reviews: 40, cards: [hard(arabicCard, 5, 8)] },
});

/** A deck with a long title, a card of a long text forgotten. */
export const longProgress: DeckProgress = deckProgressOf(longTitleDeck, {
  progress: { new: 0, relearning: 0, young: 2, mature: 8 },
  hardest: {
    reviews: 60,
    cards: [
      hard(
        storyCard(
          longTitleDeck,
          "danube",
          {
            en: "Which ten countries does the Danube flow through or form a border of, from its source to the Black Sea?",
          },
          {
            en: "Germany, Austria, Slovakia, Hungary, Croatia, Serbia, Romania, Bulgaria, Moldova and Ukraine",
          },
        ),
        4,
        6,
      ),
    ],
  },
});

/** A deck reviewed, none of its cards forgotten. */
export const easyProgress: DeckProgress = deckProgressOf(koreanDeck, {
  progress: { new: 20, relearning: 0, young: 30, mature: 30 },
  hardest: { reviews: 300, cards: [] },
});

/** A deck with more leeches than a page lists: LIST_LIMIT (50) and 12 more. */
export const manyLeechesProgress: DeckProgress = deckProgressOf(kanjiDeck, {
  progress: { new: 0, relearning: 62, young: 0, mature: 0 },
  hardest: {
    reviews: 2000,
    cards: Array.from({ length: 62 }, (_, i) =>
      hard(
        storyCard(kanjiDeck, `leech-${i}`, { en: `Leech ${i + 1}` }, { en: "?" }),
        4 + (i % 7),
        20,
      ),
    ),
  },
});
