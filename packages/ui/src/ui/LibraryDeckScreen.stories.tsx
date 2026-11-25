// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LibraryDeckScreen } from "./LibraryDeckScreen";
import { courseLibraryDeck } from "../test/course";
import {
  arabicLibraryDeck,
  capitalsLibraryDeck,
  libraryDeck,
  longTitleLibraryDeck,
} from "../test/stories/library";

/** A deck compiled from many sources, by many authors: the sources folded away. */
const compiledDeck = libraryDeck(
  "rivers",
  { en: "Rivers of Europe" },
  {
    authors: ["Anton Wiklund", "Ada Lovelace", "Grace Hopper"],
    authorCount: 120,
    sources: Array.from({ length: 8 }, (_, index) => ({
      url: `https://example.org/rivers/${index + 1}`,
      title: `River atlas, volume ${index + 1}`,
      authors: [`Cartographer ${index + 1}`],
    })),
    sourceCount: 75,
    versionNotes: "Added the Danube's tributaries.",
  },
);

/** The capitals deck at its third release, issued on a date. */
const thirdRelease = {
  ...capitalsLibraryDeck,
  url: "https://solid-memo.com/decks/capitals/v3.ttl",
  version: "3",
  releases: [
    ...capitalsLibraryDeck.releases,
    { url: "https://solid-memo.com/decks/capitals/v2.ttl", version: "2" },
    {
      url: "https://solid-memo.com/decks/capitals/v3.ttl",
      version: "3",
      issued: "2026-10-01T10:00:00.000Z",
    },
  ],
  versionNotes: "Fixed the capital of Sweden.",
};

const meta = {
  title: "Library/LibraryDeckScreen",
  component: LibraryDeckScreen,
  args: {
    deck: capitalsLibraryDeck,
    browseHref: "#/library-browser",
    previewHref: "#/library-preview",
    shareUrl: "https://solid-memo.example/#/try?deck=capitals",
    imported: false,
    busy: false,
    error: null,
    onImport: fn(),
    onStartCourse: fn(),
    reportPlace: { library: true },
  },
  parameters: { controls: { exclude: ["deck", "reportPlace"] } },
} satisfies Meta<typeof LibraryDeckScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A deck described in full, imported with its button. */
export const Deck: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Import this deck" }));
    await expect(args.onImport).toHaveBeenCalled();
  },
};

/** A later release, issued on a date, with its notes. */
export const LaterRelease: Story = { args: { deck: thirdRelease } };

/** A deck the instance already holds a copy of: a second can still be imported. */
export const AlreadyImported: Story = { args: { imported: true } };

/** The import in progress. */
export const Importing: Story = { args: { busy: true } };

/** A course: started, not imported. */
export const Course: Story = {
  args: { deck: courseLibraryDeck },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Start course" }));
    await expect(args.onStartCourse).toHaveBeenCalled();
  },
};

/** A course the instance has already started: it is continued. */
export const CourseStarted: Story = { args: { deck: courseLibraryDeck, imported: true } };

/** A deck by many authors, compiled from more sources than are listed: they are folded away. */
export const ManySources: Story = { args: { deck: compiledDeck } };

/** An Arabic deck, its name right to left. */
export const ArabicDeck: Story = { args: { deck: arabicLibraryDeck } };

/** A name long enough to wrap. */
export const LongName: Story = { args: { deck: longTitleLibraryDeck } };

/** A release added from a link: where it is published, what it is, nothing to browse or preview. */
export const FromLink: Story = {
  args: {
    host: "pod.example",
    browseHref: undefined,
    previewHref: undefined,
    reportPlace: undefined,
  },
};

/** A release that can't be added just now. */
export const Unavailable: Story = { args: { unavailable: true } };

/** An import that failed. */
export const ImportFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
