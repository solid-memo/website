// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { CardProgressReport } from "@solid-memo/application/statistics";
import type { Answer } from "@solid-memo/domain/answer";
import type { Card, Distractor } from "@solid-memo/domain/deck";
import type { ReviewState } from "@solid-memo/domain/review";
import { easeHistogram, intervalHistogram } from "@solid-memo/domain/scheduleInsight";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { deckProgressOf } from "../fakes/statistics";
import {
  storyPictureUrl,
  arabicDeck,
  kanjiCards,
  kanjiDeck,
  koreanDeck,
  longTitleDeck,
  storyCard,
  storyDeck,
} from "../storyData";

/**
 * Data the stories of the cards share (src/ui/Card*.stories.tsx and the
 * Browser's): cards in Markdown, with pictures, in several languages, at
 * a length that wraps, retired, with wrong options; a card's answers and
 * review states; the cards' progress. Nothing here is read from or
 * written to a pod.
 */

/** A card's picture, on the Storybook's own site (storyPictureUrl). */
export const pictureUrl = storyPictureUrl;

/** A deck of cards written in Markdown. */
export const gitDeck = storyDeck("git", { en: "Git commands" });

/** A card in Markdown: code, emphasis and a list. */
export const markdownCard: Card = storyCard(
  gitDeck,
  "amend",
  { en: "What does `git commit --amend` do?" },
  { en: "It **replaces** the last commit with a new one:\n\n- its message\n- its changes" },
  {
    textFormat: SM.markdown,
    frontLabel: { en: "Command" },
    backNote: { en: "Never amend a commit *already pushed*." },
  },
);

/** A word's wrong options, one with its note, one retired. */
export const waterDistractors: Distractor[] = [
  { id: "water-d1", text: { en: "fire" }, note: { en: "火 is fire; 水 has the drops." } },
  { id: "water-d2", text: { en: "tree" } },
  { id: "water-d3", text: { en: "mountain" }, retired: true },
];

/** The kanji deck's first card, with its wrong options. */
export const waterCard: Card = { ...kanjiCards[0]!, distractors: waterDistractors };

/** A card whose texts are in several languages, its notes and labels too. */
export const multilingualCard: Card = storyCard(
  koreanDeck,
  "water",
  { ko: "물", en: "mul" },
  { en: "water", sv: "vatten", ar: "ماء" },
  {
    frontLabel: { en: "Noun", sv: "Substantiv" },
    backNote: { en: "Also a drink, as in 물 주세요.", sv: "Också en dryck." },
  },
);

/** A card of the Arabic deck: both its question and its note right to left. */
export const arabicPhraseCard: Card = storyCard(
  arabicDeck,
  "welcome",
  { ar: "أهلاً وسهلاً بك في بيتنا، تفضل بالدخول" },
  { en: "Welcome to our home, please come in" },
  { frontNote: { ar: "تقال للضيف عند الباب" } },
);

/** A card with a word too long for any line, and a back that wraps. */
export const longCard: Card = storyCard(
  longTitleDeck,
  "long",
  { de: "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz" },
  {
    en: "The law on delegating the monitoring of beef labeling: a word of 63 letters, once the longest in German, until the law was repealed in 2013 and the word went with it.",
  },
);

/** A card whose front is a picture, described, with no text. */
export const pictureCard: Card = storyCard(
  storyDeck("pictures", { en: "Pictures" }),
  "cards",
  {},
  { en: "Flashcards" },
  {
    frontImageUrl: pictureUrl,
    frontImageDescription: { en: "Solid Memo's illustration of cards" },
  },
);

/** A card the library deck no longer uses. */
export const retiredCard: Card = storyCard(
  kanjiDeck,
  "mountain",
  { "": "山" },
  { en: "mountain" },
  { retired: true },
);

/** The kanji deck with enough cards to page through. */
export const manyKanjiCards: Card[] = [
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十",
  "百",
  "千",
  "万",
  "円",
  "日",
  "月",
  "年",
  "人",
  "子",
  "女",
  "男",
  "名",
  "山",
  "川",
  "田",
].map((kanji, index) =>
  storyCard(kanjiDeck, `k${index}`, { "": kanji }, { en: `kanji ${index + 1}` }),
);

let answerCount = 0;

/** An answer to the water card, on a study day. */
export function waterAnswer(
  studyDay: string,
  grade: Answer["grade"],
  more: Partial<Answer> = {},
): Answer {
  answerCount += 1;
  return {
    id: `answer-${answerCount}`,
    deckUrl: kanjiDeck.url,
    cardUrl: waterCard.url,
    direction: "front-to-back",
    grade,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    nextIntervalDays: 1,
    ...more,
  };
}

/** The water card's answers, newest first: a course question, reviews, a repeat and the first. */
export const waterAnswers: Answer[] = [
  waterAnswer("2026-09-20", 1, {
    mode: "multiple-choice",
    chosenDistractor: `${kanjiDeck.cardsDocumentUrl}#water-d1`,
    priorIntervalDays: 6,
    nextIntervalDays: 1,
  }),
  waterAnswer("2026-09-14", 5, {
    mode: "multiple-choice",
    priorIntervalDays: 1,
    nextIntervalDays: 6,
  }),
  waterAnswer("2026-09-03", 5, { priorIntervalDays: 1, nextIntervalDays: 6 }),
  waterAnswer("2026-09-02", 4, { priorIntervalDays: 1 }),
  waterAnswer("2026-09-02", 1, { priorIntervalDays: 1 }),
  waterAnswer("2026-09-01", 4),
];

/** More answers than the history lists: only the newest are shown. */
export const manyWaterAnswers: Answer[] = Array.from({ length: 1005 }, (_, index) =>
  waterAnswer(`2026-0${1 + (index % 9)}-1${index % 10}`, 4, { priorIntervalDays: 1 }),
);

/** The water card's review state in a direction. */
export function waterState(
  direction: ReviewState["direction"],
  more: Partial<ReviewState> = {},
): ReviewState {
  return {
    cardId: waterCard.id,
    direction,
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    due: "2026-09-27",
    firstReviewedAt: "2026-09-01T10:00:00.000Z",
    lastReviewedAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 2,
    ...more,
  };
}

/** The cards' progress of the story decks: the kanji studied a while, the Korean words new. */
export const progressReport: CardProgressReport = {
  today: "2026-09-21",
  decks: [
    deckProgressOf(kanjiDeck, {
      progress: { new: 12, relearning: 1, young: 4, mature: 9 },
      forecast: [
        { studyDay: "2026-09-21", due: 3, reviews: 3 },
        { studyDay: "2026-09-22", due: 5, reviews: 4 },
        { studyDay: "2026-09-23", due: 2, reviews: 3 },
        { studyDay: "2026-09-24", due: 0, reviews: 0 },
      ],
      intervals: intervalHistogram([
        waterState("front-to-back"),
        waterState("back-to-front", { intervalDays: 40 }),
      ]),
      eases: easeHistogram([
        waterState("front-to-back"),
        waterState("back-to-front", { easeFactor: 2.1 }),
      ]),
      overdue: 2,
      daysToClear: 2,
    }),
    deckProgressOf(koreanDeck, { progress: { new: 40, relearning: 0, young: 0, mature: 0 } }),
  ],
};
