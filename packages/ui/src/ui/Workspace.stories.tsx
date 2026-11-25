// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { render } from "preact";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { Workspace } from "./Workspace";
import { routeToHash } from "./router";
import { makeUseCasesFake } from "../test/useCasesFake";
import { kanjiCards, kanjiDeck, storyDecks, storyInstance } from "../test/storyData";
import { libraryDecks } from "../test/stories/library";
import {
  allTimeReport,
  arabicProgress,
  kanjiProgress,
  STORY_TODAY,
} from "../test/stories/statistics";
import { storyWebId, storyWebIdDocument } from "../test/stories/webId";

const instanceUrl = storyInstance.url;

/** The learner's one instance, its decks, their cards, the library and the statistics. */
const workspaceUseCases = makeUseCasesFake({
  listInstances: fn(async () => [storyInstance]),
  listDecks: fn(async () => storyDecks),
  listCards: fn(async () => kanjiCards),
  listLibraryDecks: fn(async () => libraryDecks),
  getStatistics: fn(async () => allTimeReport),
  getCardProgress: fn(async () => ({
    today: STORY_TODAY,
    decks: [kanjiProgress, arabicProgress],
  })),
});

const meta = {
  title: "App/Workspace",
  component: Workspace,
  args: {
    useCases: workspaceUseCases,
    session: { webId: storyWebId },
    banner: null,
    children: null,
  },
  parameters: {
    controls: { exclude: ["useCases", "session", "banner", "children"] },
    hash: routeToHash({ screen: "home", instanceUrl }),
  },
  // The route is the page's hash: set for the story, and put back after it, with the
  // workspace taken down, so its listener of the hash doesn't follow the next story's.
  beforeEach: ({ canvasElement, parameters }) => {
    const before = location.href;
    history.replaceState(null, "", `${location.pathname}${location.search}${parameters.hash}`);
    return () => {
      render(null, canvasElement);
      history.replaceState(null, "", before);
    };
  },
} satisfies Meta<typeof Workspace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The deck list of the open instance. */
export const DeckList: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", { name: "Kanji N5" }),
    ).toBeInTheDocument();
  },
};

/** A deck's page, reached from the deck list. */
export const Deck: Story = {
  parameters: {
    hash: routeToHash({ screen: "deckDetail", instanceUrl, deckUrl: kanjiDeck.url }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { level: 2, name: "Kanji N5" }),
    ).toBeInTheDocument();
  },
};

/** The library of decks to import. */
export const Library: Story = {
  parameters: { hash: routeToHash({ screen: "library", instanceUrl }) },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("checkbox", { name: "Kanji N5" }),
    ).toBeInTheDocument();
  },
};

/** The instance's statistics. */
export const Statistics: Story = {
  parameters: { hash: routeToHash({ screen: "statistics", instanceUrl }) },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("button", { name: "Download my answers (CSV)" }),
    ).toBeInTheDocument();
  },
};

/** The instance's preferences. */
export const Preferences: Story = {
  parameters: { hash: routeToHash({ screen: "preferences", instanceUrl }) },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("checkbox", { name: /Developer mode/ }),
    ).toBeInTheDocument();
  },
};

/** Developer mode on: the deck list, then the learner's WebID document under it. */
export const DeveloperMode: Story = {
  args: {
    useCases: makeUseCasesFake({
      listInstances: fn(async () => [storyInstance]),
      listDecks: fn(async () => storyDecks),
      getPreferences: fn(async () => ({ ...DEFAULT_PREFERENCES, developerMode: true })),
      viewWebIdDocument: fn(async () => storyWebIdDocument),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("WebID document"));
    await expect(
      await canvas.findByText('"Alice" (http://www.w3.org/2001/XMLSchema#string)'),
    ).toBeVisible();
  },
};

/** What the main content starts with, above the screen, and what the header shows. */
export const WithBannerAndNotice: Story = {
  render: (args) => (
    <Workspace {...args} banner={<p>The site's masthead</p>}>
      <p class="warning">A notice above the screen.</p>
    </Workspace>
  ),
};

/** A learner with no instance yet: where to keep one. */
export const NoInstances: Story = {
  args: { useCases: makeUseCasesFake() },
  parameters: { hash: "" },
};

/** The instances couldn't be read. */
export const InstancesFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      listInstances: fn(async () => {
        throw new AppError("cannotCheck");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Solid Memo could not check your Pod/),
    ).toBeInTheDocument();
  },
};
