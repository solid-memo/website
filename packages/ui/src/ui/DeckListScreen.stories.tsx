// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { Deck } from "@solid-memo/domain/deck";
import type { DeckGroup, DeckTree, TreeNode } from "@solid-memo/domain/deckTree";
import type { LangText } from "@solid-memo/domain/langText";
import { DeckListScreen } from "./DeckListScreen";
import type { Completion } from "./RowFlair";
import {
  arabicDeck,
  kanjiDeck,
  koreanDeck,
  longTitleDeck,
  storyDeck,
  storyInstance,
} from "../test/storyData";

/** A deck paused until the learner resumes it. */
const pausedDeck = storyDeck(
  "hangul",
  { en: "Hangul", ko: "한글" },
  {
    pause: { pausedAt: "2026-10-01T10:00:00.000Z" },
  },
);

/** A deck set aside for a day. */
const setAsideDeck = storyDeck(
  "capitals",
  { en: "Capitals of Europe" },
  {
    pause: { pausedAt: "2026-10-01T10:00:00.000Z", resumesOn: "2026-10-15" },
  },
);

/** A course's deck, and a finished one. */
const courseDeck = storyDeck("solid", { en: "Getting started with Solid" });
const finishedCourseDeck = storyDeck("wcag", { en: "Accessible web pages with WCAG" });

const groupUrl = (id: string) => `${storyInstance.url}catalog.ttl#${id}`;
const deckNode = (deck: Deck): TreeNode => ({ kind: "deck", deck });
const groupNode = (id: string, en: string, children: TreeNode[]): TreeNode => ({
  kind: "group",
  group: { url: groupUrl(id), title: { en } },
  children,
});

/**
 * The decks in groups: languages (with a group of Asian scripts in it),
 * geography, an empty group and decks at the top.
 */
const tree: DeckTree = {
  readOnly: false,
  children: [
    deckNode(kanjiDeck),
    groupNode("languages", "Languages", [
      deckNode(koreanDeck),
      deckNode(arabicDeck),
      groupNode("asian", "Asian scripts", [deckNode(pausedDeck)]),
    ]),
    groupNode("geography", "Geography", [deckNode(longTitleDeck), deckNode(setAsideDeck)]),
    deckNode(courseDeck),
    deckNode(finishedCourseDeck),
    groupNode("later", "Later", []),
  ],
};

/** What each deck has to study today. */
const dueToday: Record<string, number> = {
  kanji: 12,
  korean: 0,
  arabic: 4,
  long: 30,
  solid: 6,
  wcag: 0,
};

/** What a deck completed, by id. */
const completed: Record<string, Completion> = {
  korean: "deck",
  wcag: "course",
};

/** The course a deck is the copy of, by id. */
const courses: Record<string, string> = {
  solid: "#/course?id=solid",
  wcag: "#/course?id=wcag",
};

/** The decks paused today, by id. */
const pausedToday = new Set(["hangul", "capitals"]);

const meta = {
  title: "Decks/DeckListScreen",
  component: DeckListScreen,
  args: {
    tree,
    deckHeld: (_deck: Deck): boolean => false,
    collapsed: new Set<string>(),
    onToggle: fn(),
    onUnfold: fn(),
    onEdit: fn(async () => true),
    newGroup: fn((title: LangText): DeckGroup => ({ url: groupUrl("new"), title })),
    onRenameDeck: fn(),
    onRemoveDeck: fn(),
    error: null,
    libraryHref: "#/library",
    deckHref: fn((deck: Deck) => `#/deck?id=${deck.id}`),
    preferencesHref: fn((deck: Deck) => `#/deck-preferences?id=${deck.id}`),
    renderStudyAction: fn((deck: Deck) => (
      <span class="hint study-counts">{dueToday[deck.id]} to review</span>
    )),
    createDeckHref: "#/create-deck",
  },
  parameters: {
    controls: {
      exclude: [
        "tree",
        "collapsed",
        "deckHeld",
        "newGroup",
        "deckHref",
        "preferencesHref",
        "courseHref",
        "fromHost",
        "newerRelease",
        "renderStudyAction",
        "offer",
        "pause",
        "completion",
      ],
    },
  },
} satisfies Meta<typeof DeckListScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Decks in groups, a group in a group and an empty group; a deck's menu puts two decks in a new group. */
export const Groups: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Actions for Kanji N5" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", {
        name: "Group with the one below",
      }),
    );
    await waitFor(() => expect(args.onEdit).toHaveBeenCalled());
    await expect(args.newGroup).toHaveBeenCalled();
  },
};

/** Groups folded shut; opening one says so. */
export const CollapsedGroups: Story = {
  args: { collapsed: new Set([groupUrl("languages"), groupUrl("geography")]) },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Geography/ }));
    await expect(args.onToggle).toHaveBeenCalledWith(groupUrl("geography"));
  },
};

/** Arranged by a newer version of Solid Memo: the list cannot be rearranged here. */
export const ReadOnly: Story = { args: { tree: { ...tree, readOnly: true } } };

/** The arrangement has invalid data, set aside: the list cannot be rearranged until it is fixed. */
export const ArrangementSetAside: Story = { args: { arrangementSetAside: true } };

/** Decks paused today, one until the learner resumes it, one set aside until a day; its menu resumes it. */
export const Paused: Story = {
  args: {
    pause: {
      pausedToday: fn((deck: Deck) => pausedToday.has(deck.id)),
      onPause: fn(),
      onResume: fn(),
    },
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Actions for Capitals of Europe" }),
    );
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Resume" }),
    );
    await expect(args.pause!.onResume).toHaveBeenCalledWith(setAsideDeck);
  },
};

/** Decks and courses completed: their rows turn gold; a course's menu continues it. */
export const CompletedAndCourses: Story = {
  args: {
    completion: fn((deck: Deck) => completed[deck.id]),
    courseHref: fn((deck: Deck) => courses[deck.id]),
  },
};

/** Copies of library releases: one added from a link, one with a newer release; with an offer above the list. */
export const ReleasesAndOffer: Story = {
  args: {
    fromHost: fn((deck: Deck) => (deck.id === "arabic" ? "decks.example" : null)),
    newerRelease: fn((deck: Deck) => deck.id === "kanji"),
    importUrlHref: "#/import-url",
    studioHref: "#/studio",
    offer: (
      <p class="hint">
        New here? <a href="#/course?id=newcomers">Start the course for newcomers</a>.
      </p>
    ),
  },
};

/** The data is still being checked: the list cannot be rearranged yet; held decks cannot be renamed or deleted. */
export const Checking: Story = {
  args: { checking: true, deckHeld: fn((deck: Deck) => deck.id === "kanji") },
};

/** No decks yet. */
export const Empty: Story = { args: { tree: { readOnly: false, children: [] } } };

/** The last edit could not be written, under a heading of its own. */
export const EditFailed: Story = {
  args: {
    heading: "Decks in My study",
    error: "The server did not answer in time. Check your connection and try again.",
  },
};
