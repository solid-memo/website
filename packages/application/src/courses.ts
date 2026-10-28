// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { isCopyOf } from "@solid-memo/domain/library";
import type { Deck } from "@solid-memo/domain/deck";
import type { LibraryCard, LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { ReviewState } from "@solid-memo/domain/review";
import type { ResponseTimes } from "@solid-memo/domain/answer";
import {
  courseAnswerEffect,
  courseProgress,
  outlineOfCards,
  type CompletedChaptersEdit,
  type CourseAnswerEffect,
  type CourseOutline,
  type CourseProgress,
} from "@solid-memo/domain/course";
import type { DeckLibrary, DeckRepository, ReviewStateRepository } from "./ports";
import { AppError } from "@solid-memo/domain/appError";
import { promptDueOf } from "./answerStore";
import type { PreferenceStore } from "./preferenceStore";
import type { AnswerStore } from "./answerStore";

export interface CourseUseCases {
  /**
   * Start a course (a library deck whose release is a course, see
   * docs/courses.md): the instance's deck of it, a copy of the current
   * release with its title, description, authors and the rest, but no
   * cards — a card joins it when its question is first answered
   * (answerCourseQuestion). The copy the instance already has, of any
   * release (isCopyOf), when it has one: a course is started once.
   */
  startCourse(instanceUrl: string, course: LibraryDeck): Promise<Deck>;
  /**
   * A course as the learner has it: the deck's catalog entry as it is
   * now, the release it was copied from (its outline and cards) and the
   * learner's progress through it. Throws deckGone when the deck is gone;
   * a deck that is no library copy is a mistake of the caller (a plain
   * Error). Writes nothing.
   */
  getCourse(deck: Deck): Promise<Course>;
  /**
   * What the deck list's strip of courses needs of a course: its
   * release's outline and the cards the learner has answered. The deck
   * is taken as given, its catalog entry not read again, and the
   * release's cards are not mapped. A deck that is no library copy is a
   * mistake of the caller (a plain Error). Writes nothing.
   */
  getCourseSummary(deck: Deck): Promise<CourseSummary>;
  /**
   * Answer one of a course's multiple-choice questions (domain/course.ts
   * choicesOf): what the answer does to the card's schedule follows
   * courseAnswerEffect. A card introduced is first written into the deck,
   * as its release has it (distractors and fragment id included), then
   * graded; a review is graded as in study; either way the answer is
   * logged as a multiple-choice one, naming the wrong option chosen. No
   * daily limit applies: the learner reached the card. Writes nothing
   * when the answer is practice ("none"). The answer logged keeps how
   * long choosing took (`times`; a multiple-choice answer is not graded,
   * so it has no grading time).
   */
  answerCourseQuestion(
    instanceUrl: string,
    deck: Deck,
    card: LibraryCard,
    choice: CourseChoice,
    now: Date,
    times?: Pick<ResponseTimes, "recallMillis">,
  ): Promise<CourseAnswer>;
  /**
   * Note a chapter of the deck's course completed (its final review
   * passed), unlocking the next (DeckRepository.completeChapter). The
   * deck as its entry says then.
   */
  completeChapter(deck: Deck, chapterUrl: string): Promise<Deck>;
  /**
   * Change the chapters of the deck's course completed, as the Studio
   * does (DeckRepository.setCompletedChapters): mark one not done, or
   * restart the course. The learner's answers and review states stay.
   */
  setCompletedChapters(deck: Deck, edit: CompletedChaptersEdit): Promise<Deck>;
}

/** The option a learner chose: right or wrong, and which wrong one (a distractor's id). */
export interface CourseChoice {
  correct: boolean;
  distractorId?: string;
}

/** What answering a course question did (CourseUseCases.answerCourseQuestion). */
export interface CourseAnswer {
  /**
   * "introduce": the card joined the deck ("Added to your deck"), graded;
   * "review": it was graded; "none": nothing was written.
   */
  effect: CourseAnswerEffect["kind"];
  /** The card's review state after the answer; null for a card that has none. */
  state: ReviewState | null;
}

/** A course as the learner has it (CourseUseCases.getCourse). */
export interface Course {
  /** The course's deck in the instance, as its catalog entry says now. */
  deck: Deck;
  /** The release the deck was copied from: the course's content. */
  release: LibraryDeckContent;
  /** The release's chapters and steps. */
  outline: CourseOutline;
  /**
   * The release's cards (the questions, with their distractors) by id:
   * every question the outline asks is one of them (outlineOfCards).
   */
  cards: ReadonlyMap<string, LibraryCard>;
  /** The cards the learner has answered: those with review state in the deck. */
  answeredCardIds: string[];
  progress: CourseProgress;
}

/** What the deck list's strip needs of a course (CourseUseCases.getCourseSummary). */
export type CourseSummary = Pick<Course, "outline" | "answeredCardIds">;

/**
 * Courses (docs/courses.md): a library deck whose release is a course,
 * started as a deck of the instance with no cards, each card joining it
 * when its question is first answered, and graded as in study; and the
 * chapters the learner has completed.
 */
export function createCourseUseCases({
  deckLibrary,
  deckRepository,
  reviewStateRepository,
  preferenceStore,
  answerStore,
}: {
  deckLibrary: DeckLibrary;
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  preferenceStore: Pick<PreferenceStore, "get">;
  answerStore: Pick<AnswerStore, "grade">;
}): CourseUseCases {
  function sourceOf(deck: Deck): string {
    if (deck.sourceUrl === undefined)
      throw new Error("A course's deck names the release it was copied from");
    return deck.sourceUrl;
  }
  async function courseSummary(deck: Deck): Promise<CourseSummary> {
    const [outline, reviews] = await Promise.all([
      deckLibrary.fetchCourseOutline(sourceOf(deck)),
      reviewStateRepository.listReviewStates(deck),
    ]);
    // A course asks front to back: a card is answered once it has that state.
    const answeredCardIds = reviews.sm2
      .filter((state) => state.direction === "front-to-back")
      .map((state) => state.cardId);
    return { outline, answeredCardIds };
  }
  async function startCourse(instanceUrl: string, course: LibraryDeck): Promise<Deck> {
    const started = (await deckRepository.listDecks(instanceUrl)).find((deck) =>
      isCopyOf(deck, course),
    );
    if (started !== undefined) return started;
    const release = await deckLibrary.fetchLibraryDeck(course.url);
    // The deck says it is a course, so no screen has to read the library to tell.
    return deckRepository.importDeck(instanceUrl, { ...release, isCourse: true, cards: [] });
  }

  return {
    startCourse,
    async getCourse(offered) {
      const deck = await deckRepository.readDeck(offered.url);
      if (deck === null) throw new AppError("deckGone", { deck: offered.title });
      const [release, summary] = await Promise.all([
        deckLibrary.fetchLibraryDeck(sourceOf(deck)),
        courseSummary(deck),
      ]);
      const cards = new Map(release.cards.map((card) => [card.id, card]));
      // Read apart, the outline and the cards could be of two states of a draft: it asks only these.
      const outline = outlineOfCards(summary.outline, new Set(cards.keys()));
      const { answeredCardIds } = summary;
      return {
        deck,
        release,
        outline,
        cards,
        answeredCardIds,
        progress: courseProgress(outline, answeredCardIds, deck.completedChapters ?? []),
      };
    },
    getCourseSummary: courseSummary,
    async answerCourseQuestion(instanceUrl, deck, card, choice, now, times = {}) {
      const prompt = {
        cardId: card.id,
        cardUrl: `${deck.cardsDocumentUrl}#${card.id}`,
        direction: "front-to-back" as const,
      };
      const [prefs, current] = await Promise.all([
        preferenceStore.get(instanceUrl),
        reviewStateRepository.getReviewState(deck, {
          cardId: card.id,
          direction: prompt.direction,
        }),
      ]);
      // Whether the card is due goes by what sets its due day: under FSRS-6, its state's.
      const due = current.sm2 === null ? null : promptDueOf(current.sm2, current.fsrs, prefs);
      const effect = courseAnswerEffect(due, choice.correct, now, prefs.dayBoundaryHour);
      if (effect.kind === "none") return { effect: "none", state: current.sm2 };
      // The card joins the deck before its first state, so no state is ever without its card.
      if (effect.kind === "introduce")
        await deckRepository.applyCardChanges(deck, { save: [card], remove: [] });
      const chosen =
        choice.correct || choice.distractorId === undefined
          ? undefined
          : `${deck.cardsDocumentUrl}#${choice.distractorId}`;
      const { state } = await answerStore.grade(
        instanceUrl,
        deck,
        prompt,
        effect.grade,
        now,
        {
          mode: "multiple-choice",
          ...(chosen === undefined ? {} : { chosenDistractor: chosen }),
          times,
        },
        { prefs },
      );
      return { effect: effect.kind, state };
    },
    completeChapter(deck, chapterUrl) {
      return deckRepository.completeChapter(deck, chapterUrl);
    },
    setCompletedChapters(deck, edit) {
      return deckRepository.setCompletedChapters(deck, edit);
    },
  };
}
