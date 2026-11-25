// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentProps } from "preact";
import { useState } from "preact/hooks";
import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { CardContentFields, CardFieldsErrorMessage, draftOf, newDraft } from "./CardContentFields";
import { kanjiCards } from "../test/storyData";
import {
  arabicPhraseCard,
  markdownCard,
  multilingualCard,
  pictureCard,
} from "../test/stories/cards";

type Props = ComponentProps<typeof CardContentFields>;

/** The fields as a card's form holds them, with the form's message under them. */
function HeldFields(args: Props) {
  const [draft, setDraft] = useState(args.draft);
  return (
    <>
      <CardContentFields
        {...args}
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          args.onChange(next);
        }}
      />
      <CardFieldsErrorMessage invalid={args.invalid ?? null} />
    </>
  );
}

const suggestions = { front: ["ja"], back: ["en"], own: ["en"] };
const emptyDraft = newDraft({ front: "ja", back: "en", own: "en" });

const meta = {
  title: "Cards/CardContentFields",
  component: CardContentFields,
  args: {
    draft: draftOf(kanjiCards[0]!, ["en"]),
    saved: kanjiCards[0]!,
    busy: false,
    suggestions,
    onChange: fn(),
  },
  render: (args) => <HeldFields {...args} />,
  parameters: { controls: { exclude: ["draft", "saved", "invalid", "suggestions"] } },
} satisfies Meta<typeof CardContentFields>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A card's fields filled: its front with no language stated, its back in English. */
export const Filled: Story = {
  play: async ({ args, canvasElement }) => {
    const back = within(canvasElement).getByRole("textbox", { name: "Back" });
    await userEvent.clear(back);
    await userEvent.type(back, "water, river");
    await expect(args.onChange).toHaveBeenCalled();
  },
};

/** A new card: every field empty, each in the deck's language. */
export const Empty: Story = { args: { draft: emptyDraft, saved: undefined } };

/** The draft refused: the front is empty, its field marked and described by the message. */
export const Invalid: Story = {
  args: {
    draft: emptyDraft,
    saved: undefined,
    invalid: { error: new AppError("cardFrontEmpty") },
  },
};

/** A text whose language is still to choose: its picker takes the focus, and the message names it. */
export const MissingLanguage: Story = {
  args: {
    draft: { ...emptyDraft, front: [{ id: 0, value: "水", tag: null }] },
    saved: undefined,
    invalid: {
      error: new AppError("textNeedsLanguage", { field: "front" }),
      part: "front",
      entry: { id: 0, value: "水", tag: null },
    },
  },
};

/** A card in several languages: the front in Korean and English, the back in three, labels and notes too. */
export const MultiLanguage: Story = {
  args: { draft: draftOf(multilingualCard, ["en"]), saved: multilingualCard },
};

/** A card in Markdown: textareas, hints, the cheat sheet and a preview. */
export const Markdown: Story = {
  args: { draft: draftOf(markdownCard, ["en"]), saved: markdownCard },
};

/** Text switched to Markdown that reads otherwise as Markdown: a status says so. */
export const SwitchedToMarkdown: Story = {
  args: {
    draft: {
      ...emptyDraft,
      front: [{ id: 0, value: "What does *nix mean? Unix and the *likes*", tag: "en" }],
      back: [{ id: 0, value: "24", tag: "en" }],
    },
    saved: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Format with Markdown" }));
    await expect(await canvas.findByText(/reads differently as Markdown/)).toBeInTheDocument();
  },
};

/** A card in Arabic, right to left, and a picture's URL that is not a web address. */
export const RightToLeftWithPicture: Story = {
  args: {
    draft: { ...draftOf(arabicPhraseCard, ["en"]), frontImageUrl: pictureCard.frontImageUrl! },
    saved: arabicPhraseCard,
    invalid: { error: new AppError("cardFrontImageNotWebUrl") },
  },
  globals: { direction: "rtl" },
};

/** While the card saves: nothing can be changed. */
export const Busy: Story = { args: { busy: true } };
