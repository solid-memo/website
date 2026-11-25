// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { DeckProvenance } from "./DeckProvenance";

const meta = {
  title: "Decks/DeckProvenance",
  component: DeckProvenance,
  args: {
    authors: ["Anton Wiklund"],
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
    modifiedAt: "2026-09-27T20:12:13.000Z",
  },
} satisfies Meta<typeof DeckProvenance>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Author, license and the day the deck last changed. */
export const Byline: Story = {};

/** A byline with a description, its URLs as links. */
export const WithDescription: Story = {
  args: {
    authors: ["Anton Wiklund", "A friend <friend@example.com>"],
    description: {
      en: "Flags from https://flagcdn.com, listed at https://flagpedia.net/index. Enjoy!",
    },
  },
};

/** A long description that wraps under the byline. */
export const LongDescription: Story = {
  args: {
    description: {
      en: "Every capital, river and mountain range of Europe, gathered from public atlases and checked against each country's own records, with a flag on every card and a note on how each name is said in the country's own language.",
    },
  },
};

/** A description in a language other than the page's, marked as such. */
export const DescriptionInOtherLanguage: Story = {
  args: {
    authors: [],
    license: undefined,
    modifiedAt: undefined,
    description: { ar: "تحيات عربية للمبتدئين" },
  },
};

/** A home-made deck that states nothing: the component renders nothing. */
export const NothingStated: Story = {
  args: { authors: [], license: undefined, modifiedAt: undefined },
};
