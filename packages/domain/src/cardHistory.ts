// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { monthOfStudyDay, type Answer } from "./answer";
import { chainIndexOf, isLapse, isScoredReview } from "./answerChain";
import type { Deck, Distractor } from "./deck";
import { fragmentIdOf } from "./subjectUrl";

/**
 * A card's history, from the answer log (domain/answer.ts): its answers,
 * the wrong options chosen in them, how often each card of a deck was
 * forgotten (its lapses), and so which cards are hardest and which wrong
 * options are mistaken for the right one most. Pure; the use cases read
 * the log.
 */

/** A card whose reviews lapsed this many times or more is a leech: it keeps costing reviews and is worth a look. */
export const LEECH_LAPSES = 4;

/** How often each card was forgotten, since the first month the answers given cover. */
export interface LapseIndex {
  /**
   * By card IRI: its lapses (answerChain.ts isLapse), scored reviews below
   * grade 3, in either direction. A card never forgotten is left out.
   */
  lapses: ReadonlyMap<string, number>;
  /** The first month answered in ("YYYY-MM"), which the lapses count from; null without answers. */
  since: string | null;
}

/** A card forgotten in its reviews: how often, and of how many. */
export interface HardCard<C> {
  card: C;
  /** Its lapses (answerChain.ts isLapse), in either direction. */
  lapses: number;
  /** Its scored reviews (answerChain.ts isScoredReview), the lapses among them. */
  reviews: number;
}

/** A deck's cards forgotten in their reviews, the hardest first, and the reviews they are counted from (hardestCardsOf). */
export interface HardestCards<C> {
  /** Every scored review of the answers given, of any card. */
  reviews: number;
  cards: HardCard<C>[];
}

/** A wrong option chosen in a card's multiple-choice answers, and how often (confusionsOf). */
export interface Confusion<C> {
  card: C;
  distractor: Distractor;
  picks: number;
}

/**
 * The deck's answers, each naming its card and wrong option in the deck's
 * cards document as it is now, by fragment id: a library upgrade moves the
 * cards into a new document, and their history goes with them. A card
 * moved to another deck keeps naming its old deck, so its history there
 * starts again.
 */
export function deckAnswers(
  answers: readonly Answer[],
  deck: Pick<Deck, "url" | "cardsDocumentUrl">,
): Answer[] {
  const here = (iri: string) => `${deck.cardsDocumentUrl}#${fragmentIdOf(iri)}`;
  return answers
    .filter((answer) => answer.deckUrl === deck.url)
    .map((answer) => ({
      ...answer,
      cardUrl: here(answer.cardUrl),
      ...(answer.chosenDistractor === undefined
        ? {}
        : { chosenDistractor: here(answer.chosenDistractor) }),
    }));
}

/** The answers of one card (its IRI), newest first. */
export function cardAnswers(answers: readonly Answer[], cardIri: string): Answer[] {
  return answers
    .filter((answer) => answer.cardUrl === cardIri)
    .sort((a, b) => b.answeredAt.localeCompare(a.answeredAt) || b.id.localeCompare(a.id));
}

/** How often each wrong option was chosen, by its IRI. */
export function distractorPicksOf(answers: readonly Answer[]): Map<string, number> {
  const picks = new Map<string, number>();
  for (const { chosenDistractor } of answers) {
    if (chosenDistractor !== undefined)
      picks.set(chosenDistractor, (picks.get(chosenDistractor) ?? 0) + 1);
  }
  return picks;
}

/**
 * How often each card was forgotten in its reviews (its lapses), in the
 * answers given, and since which month. First answers, repeats the same
 * day and course answers are not lapses. The answers are a deck's, as
 * deckAnswers gives them.
 */
export function lapseIndex(answers: readonly Answer[]): LapseIndex {
  const index = chainIndexOf(answers);
  const lapses = new Map<string, number>();
  let first: string | null = null;
  for (const answer of answers) {
    if (first === null || answer.studyDay < first) first = answer.studyDay;
    if (isLapse(answer, index)) lapses.set(answer.cardUrl, (lapses.get(answer.cardUrl) ?? 0) + 1);
  }
  return { lapses, since: first === null ? null : monthOfStudyDay(first) };
}

/**
 * The cards given that were forgotten in their reviews (lapses, as
 * lapseIndex counts them), the most often forgotten first, then the
 * largest share of their reviews forgotten, then by IRI; and how many
 * scored reviews the answers hold in all. A card not given (removed or
 * retired) is left out. The answers are a deck's, as deckAnswers gives
 * them.
 */
export function hardestCardsOf<C extends { url: string }>(
  answers: readonly Answer[],
  cards: readonly C[],
): HardestCards<C> {
  const index = chainIndexOf(answers);
  const counts = new Map<string, { lapses: number; reviews: number }>();
  let reviews = 0;
  for (const answer of answers) {
    if (!isScoredReview(answer, index)) continue;
    reviews += 1;
    let count = counts.get(answer.cardUrl);
    if (count === undefined) counts.set(answer.cardUrl, (count = { lapses: 0, reviews: 0 }));
    count.reviews += 1;
    if (isLapse(answer, index)) count.lapses += 1;
  }
  return {
    reviews,
    cards: cards
      .flatMap((card) => {
        const count = counts.get(card.url);
        return count === undefined || count.lapses === 0 ? [] : [{ card, ...count }];
      })
      .sort(
        (a, b) =>
          b.lapses - a.lapses ||
          b.lapses / b.reviews - a.lapses / a.reviews ||
          a.card.url.localeCompare(b.card.url),
      ),
  };
}

/**
 * The wrong options chosen in the answers given (distractorPicksOf), each
 * with the card given that has it, the most chosen first, then by the
 * card's IRI and the option's id. An option no card given has (removed,
 * or its card retired) is left out. The answers are a deck's, as
 * deckAnswers gives them.
 */
export function confusionsOf<C extends { url: string; distractors?: readonly Distractor[] }>(
  answers: readonly Answer[],
  cards: readonly C[],
): Confusion<C>[] {
  const options = new Map<string, { card: C; distractor: Distractor }>();
  for (const card of cards)
    for (const distractor of card.distractors ?? [])
      options.set(distractor.id, { card, distractor });
  return [...distractorPicksOf(answers)]
    .flatMap(([iri, picks]) => {
      const option = options.get(fragmentIdOf(iri));
      return option === undefined ? [] : [{ ...option, picks }];
    })
    .sort(
      (a, b) =>
        b.picks - a.picks ||
        a.card.url.localeCompare(b.card.url) ||
        a.distractor.id.localeCompare(b.distractor.id),
    );
}
