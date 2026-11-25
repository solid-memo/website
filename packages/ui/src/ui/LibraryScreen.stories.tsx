// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { LibraryDeckRow, LibraryScreen } from "./LibraryScreen";
import { forget } from "./remembered";
import { courseLibraryDeck } from "../test/course";
import {
  arabicLibraryDeck,
  capitalsLibraryDeck,
  koreanLibraryDeck,
  libraryDecks,
  manyLibraryDecks,
} from "../test/stories/library";

/** What the screen keeps under its memory key: the checked decks and the filters. */
const REMEMBERED = ["selected", "topics", "languages", "query"];

const meta = {
  title: "Library/LibraryScreen",
  component: LibraryScreen,
  args: {
    decks: libraryDecks,
    memoryKey: "story:library",
    deckHref: fn((deck: LibraryDeck) => `#/library-deck?deck=${deck.seriesUrl}`),
    previewHref: fn((deck: LibraryDeck) => `#/library-preview?deck=${deck.seriesUrl}`),
    importUrlHref: "#/import-url",
    isImported: fn(() => false),
    busy: false,
    error: null,
    onImport: fn(),
  },
  // What a story checks or types is kept past it: the next story starts afresh.
  beforeEach:
    ({ args }) =>
    () => {
      for (const part of REMEMBERED) forget(`${args.memoryKey}:${part}`);
    },
  parameters: { controls: { exclude: ["decks", "deckHref", "previewHref", "isImported"] } },
} satisfies Meta<typeof LibraryScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Decks in several card languages and topics; two checked and imported in one go. */
export const ManyDecks: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Capitals of the world" }));
    await userEvent.click(canvas.getByRole("checkbox", { name: "Kanji N5" }));
    await userEvent.click(canvas.getByRole("button", { name: "Import 2 decks" }));
    await expect(args.onImport).toHaveBeenCalledWith([capitalsLibraryDeck, libraryDecks[3]]);
  },
};

/** A search that no deck matches. */
export const NoMatch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search" }), "volcanoes");
    await expect(canvas.getByText("No deck matches.")).toBeInTheDocument();
    await expect(canvas.getByText("0 of 5 decks")).toBeInTheDocument();
  },
};

/** Narrowed to the decks whose cards are in Korean. */
export const ByCardLanguage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const languages = canvas.getByRole("group", { name: "Card languages" });
    await userEvent.click(within(languages).getByRole("checkbox", { name: "Korean" }));
    await expect(canvas.getByText("1 of 5 decks")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Korean everyday words" })).toBeInTheDocument();
  },
};

/** Two decks the instance already holds a copy of. */
export const AlreadyImported: Story = {
  args: {
    isImported: fn(
      (deck: LibraryDeck) => deck === capitalsLibraryDeck || deck === arabicLibraryDeck,
    ),
  },
};

/** A course among the decks: it has no checkbox, being started from its page. */
export const WithCourse: Story = {
  args: { decks: [courseLibraryDeck, ...libraryDecks] },
};

/** A long list of the library's decks. */
export const LongList: Story = {
  args: { decks: manyLibraryDecks },
};

/** The library has no decks yet. */
export const Empty: Story = {
  args: { decks: [] },
};

/** An import in progress: the checkboxes wait. */
export const Importing: Story = {
  args: { busy: true, decks: [capitalsLibraryDeck, koreanLibraryDeck] },
};

/** An import that failed. */
export const ImportFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};

/** One deck's row alone, as the Studio previews a draft's listing: a course, already imported. */
export const DeckRow: Story = {
  render: () => (
    <ul class="library-list">
      <li>
        <LibraryDeckRow
          deck={courseLibraryDeck}
          selected={false}
          imported
          busy={false}
          deckHref="#/library-deck"
          previewHref="#/library-preview"
          onToggle={fn()}
        />
      </li>
    </ul>
  ),
};
