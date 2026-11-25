// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentProps } from "preact";
import { useState } from "preact/hooks";
import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ErrorMessage } from "./ErrorMessage";
import { LangTextField, type LangTextDraft } from "./LangTextField";

type Props = ComponentProps<typeof LangTextField>;

/** The field as a form holds it: its draft changes as the user types, and says so (`onChange`). */
function HeldField(args: Props) {
  const [draft, setDraft] = useState(args.draft);
  return (
    <>
      <LangTextField
        {...args}
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          args.onChange(next);
        }}
      />
      <ErrorMessage id="story-field-error" error={args.invalid ? "Write the deck's name." : null} />
    </>
  );
}

const meta = {
  title: "Cards/LangTextField",
  component: LangTextField,
  args: {
    id: "story-field",
    label: "Name",
    role: "deckName",
    draft: [{ id: 0, value: "Kanji N5", tag: "en" }],
    suggestions: ["en", "ja"],
    onChange: fn(),
  },
  render: (args) => <HeldField {...args} />,
  parameters: { controls: { exclude: ["draft", "missing", "inputRef", "hint", "entryHints"] } },
} satisfies Meta<typeof LangTextField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Text in one language: typing changes the draft. */
export const Filled: Story = {
  play: async ({ args, canvasElement }) => {
    const field = within(canvasElement).getByRole("textbox", { name: "Name" });
    await userEvent.type(field, " kanji");
    await expect(field).toHaveValue("Kanji N5 kanji");
    await expect(args.onChange).toHaveBeenCalled();
  },
};

/** Nothing written yet, in no language yet: a placeholder and a hint. */
export const Empty: Story = {
  args: {
    draft: [{ id: 0, value: "", tag: null }],
    placeholder: "e.g. Kanji N5",
    hint: (
      <p id="story-field-hint" class="hint field-hint">
        What the deck is called in the list.
      </p>
    ),
    describedBy: "story-field-hint",
    required: true,
  },
};

/** The text refused: marked invalid, described by the form's message. */
export const Invalid: Story = {
  args: {
    draft: [{ id: 0, value: "", tag: "en" }],
    invalid: true,
    describedBy: "story-field-error",
  },
};

/** A translation whose language is still to choose: its picker is marked, the form's message names it. */
export const MissingLanguage: Story = {
  args: {
    draft: [
      { id: 0, value: "Kanji N5", tag: "en" },
      { id: 1, value: "漢字 N5", tag: null },
    ],
    missing: { id: 1, value: "漢字 N5", tag: null },
    errorId: "story-missing-error",
  },
  render: (args) => (
    <>
      <HeldField {...args} />
      <ErrorMessage id="story-missing-error" error="Choose the language of the name." />
    </>
  ),
};

const translated: LangTextDraft = [
  { id: 0, value: "Everyday Korean words", tag: "en" },
  { id: 1, value: "한국어 생활 단어", tag: "ko" },
  { id: 2, value: "Vardagliga koreanska ord", tag: "sv" },
  { id: 3, value: "كلمات كورية يومية", tag: "ar" },
];

/** Text in several languages, the translations open: Korean, Swedish and Arabic, right to left. */
export const MultiLanguage: Story = {
  args: { draft: translated, translationsOpen: true, suggestions: ["en", "ko", "sv", "ar"] },
};

/** A translation is added: a new text whose language is still to choose. */
export const AddTranslation: Story = {
  args: { translationsOpen: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Add a translation" }));
    await expect(
      await canvas.findByRole("button", { name: "Remove this translation" }),
    ).toBeInTheDocument();
  },
};

/** Text saved with no language, which keeps none until the user chooses one. */
export const SavedWithNoLanguage: Story = {
  args: { draft: [{ id: 0, value: "水", tag: "" }], label: "Front", role: "front" },
};

/** A long text in a textarea, where Enter starts a new line, with a hint about its Markdown. */
export const Multiline: Story = {
  args: {
    label: "Description",
    role: "description",
    multiline: true,
    draft: [
      {
        id: 0,
        value:
          "The 80 kanji of the JLPT N5, each with its meaning in English.\n\nThe cards ask the meaning; study them both ways to write them too.",
        tag: "en",
      },
    ],
    entryHints: fn(() => ["The text holds a blank line: it shows as two paragraphs."]),
  },
};

/** While the form saves: nothing can be changed. */
export const Disabled: Story = { args: { draft: translated, disabled: true } };
