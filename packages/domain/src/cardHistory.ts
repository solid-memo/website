import { isRecalled, monthOfStudyDay, type Answer } from "./answer";
import type { Deck } from "./deck";
import { fragmentIdOf } from "./subjectUrl";

/**
 * A card's history, from the answer log (domain/answer.ts): its answers,
 * the wrong options chosen in them, and how often each card of a deck was
 * forgotten (its lapses). Pure; the use cases read the log.
 */

/** A card forgotten this many times or more is a leech: it keeps costing reviews and is worth a look. */
export const LEECH_LAPSES = 4;

/** How often each card was forgotten, since the first month the answers given cover. */
export interface LapseIndex {
  /** By card IRI: its answers below grade 3. A card never forgotten is left out. */
  lapses: ReadonlyMap<string, number>;
  /** The first month answered in ("YYYY-MM"), which the lapses count from; null without answers. */
  since: string | null;
}

/**
 * The deck's answers, each naming its card and wrong option in the deck's
 * cards document as it is now, by fragment id: a library upgrade moves the
 * cards into a new document, and their history goes with them. A card
 * moved to another deck keeps naming its old deck, so its history there
 * starts again.
 */
export function deckAnswers(answers: readonly Answer[], deck: Pick<Deck, "url" | "cardsDocumentUrl">): Answer[] {
  const here = (iri: string) => `${deck.cardsDocumentUrl}#${fragmentIdOf(iri)}`;
  return answers
    .filter((answer) => answer.deckUrl === deck.url)
    .map((answer) => ({
      ...answer,
      cardUrl: here(answer.cardUrl),
      ...(answer.chosenDistractor === undefined ? {} : { chosenDistractor: here(answer.chosenDistractor) }),
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
    if (chosenDistractor !== undefined) picks.set(chosenDistractor, (picks.get(chosenDistractor) ?? 0) + 1);
  }
  return picks;
}

/** How often each card was forgotten (an answer below grade 3), in the answers given, and since which month. */
export function lapseIndex(answers: readonly Answer[]): LapseIndex {
  const lapses = new Map<string, number>();
  let first: string | null = null;
  for (const answer of answers) {
    if (first === null || answer.studyDay < first) first = answer.studyDay;
    if (!isRecalled(answer)) lapses.set(answer.cardUrl, (lapses.get(answer.cardUrl) ?? 0) + 1);
  }
  return { lapses, since: first === null ? null : monthOfStudyDay(first) };
}
