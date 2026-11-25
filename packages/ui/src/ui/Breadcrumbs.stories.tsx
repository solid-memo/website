// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { Breadcrumbs, type Crumb } from "./Breadcrumbs";

const instanceUrl = "https://pod.example/memo/";
const deckUrl = "https://pod.example/memo/kanji.ttl#deck";

const decks: Crumb = { label: "Decks", route: { screen: "home", instanceUrl } };

const meta = {
  title: "Basics/Breadcrumbs",
  component: Breadcrumbs,
  args: {
    crumbs: [
      decks,
      { label: "Kanji N5", route: { screen: "deckDetail", instanceUrl, deckUrl } },
      { label: "Cards", route: { screen: "browser", instanceUrl, deckUrl } },
      {
        label: "日",
        lang: "ja",
        route: { screen: "card", instanceUrl, deckUrl, cardUrl: `${deckUrl}-sun` },
      },
    ],
  },
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The trail down to a card, its front in Japanese; the last crumb is the current page. */
export const ToACard: Story = {};

/** A top-level screen: a single crumb. */
export const TopLevel: Story = { args: { crumbs: [decks] } };

/** A deck with a long name, wrapping, and a card in Arabic, right to left. */
export const LongAndArabic: Story = {
  args: {
    crumbs: [
      decks,
      {
        label:
          "Fastighetstekniker/Drifttekniker, fastighet: every occupation in the Swedish register, with its tasks",
        route: { screen: "deckDetail", instanceUrl, deckUrl },
      },
      { label: "Cards", route: { screen: "browser", instanceUrl, deckUrl } },
      {
        label: "مرحبا",
        lang: "ar",
        route: { screen: "card", instanceUrl, deckUrl, cardUrl: `${deckUrl}-hello` },
      },
    ],
  },
};
