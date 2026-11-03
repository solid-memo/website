// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * The app's screens a journey step can end on, each in the theme tour
 * (journeys/tour-*.journey.ts) that checks it in every palette and
 * theme (docs/accessibility.md). A step names the screen it leaves the
 * app on (App.step's `screen`); a name is one of these, so a screen no
 * tour checks can't be named, and each tour fails when it hasn't checked
 * every screen of its own. A tour may check more than the journeys
 * name: a state no step ends on, such as an answer shown.
 */
export const TOURS = {
  /** Solid Memo, logged in or a guest: from the landing page to the statistics. */
  learner: [
    "onboarding",
    "onboarding.invalid-webid",
    "decks.empty",
    "decks",
    "decks.guest",
    "decks.scheduler-invitation",
    "decks.welcome-back",
    "decks.group",
    "guest-offer",
    "guest-offer.leftover",
    "deck",
    "deck-browser",
    "card-creator",
    "card-editor",
    "study",
    "study.answer",
    "preferences",
    "statistics",
    "statistics.empty",
    "statistics.deck",
    "instance-picker",
    "validation",
  ],
  /** The deck library, adding from a link, and taking a course. */
  library: [
    "library",
    "library.not-found",
    "library-deck",
    "import-url",
    "course",
    "course.completed",
    "chapter",
    "chapter.question",
    "chapter-review",
    "statistics.courses",
  ],
  /** Solid Memo Studio: an instance's decks and cards, its drafts and releases. */
  studio: [
    "studio.landing",
    "studio.no-instance",
    "studio.home",
    "studio.confirm",
    "studio.cards",
    "studio.card",
    "studio.card.schedule",
    "studio.card.history",
    "studio.instance-health",
    "studio.deck-schedule",
    "studio.deck-about",
    "studio.groups",
    "studio.export",
    "studio.drafts",
    "studio.instance",
    "studio.draft",
    "studio.draft.diff",
    "studio.draft.trial",
    "studio.draft.check",
    "studio.draft.release",
    "studio.releases",
    "studio.graph",
    "studio.library-copies",
  ],
  /** What the app shows when something goes wrong. */
  errors: ["crash", "studio.draft.refused", "studio.draft.release-refused"],
} as const satisfies Record<string, readonly string[]>;

export type Tour = keyof typeof TOURS;
export type ScreenName = (typeof TOURS)[Tour][number];

/**
 * The states only a tour reaches, as no journey's step ends on them: a
 * tour checks these in Standard light too, and their reflow, which the
 * journeys check every other screen in.
 */
export const TOUR_ONLY: readonly ScreenName[] = [
  "study.answer",
  "chapter.question",
  "studio.confirm",
];

/** The screens of a tour it hasn't checked yet, in the tour's order. */
export function unchecked(tour: Tour, checked: ReadonlySet<string>): ScreenName[] {
  return TOURS[tour].filter((screen) => !checked.has(screen));
}
