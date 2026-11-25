// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentProps } from "preact";
import { useState } from "preact/hooks";
import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { LangText } from "@solid-memo/domain/langText";
import { DataProse } from "./DataText";
import { ErrorMessage } from "./ErrorMessage";
import { ProseField } from "./ProseField";

type Props = ComponentProps<typeof ProseField>;

/** The field as a course editor holds it: its text and Markdown switch change as the user edits. */
function HeldField(args: Props) {
  const [draft, setDraft] = useState(args.draft);
  const [markdown, setMarkdown] = useState(args.markdown);
  return (
    <ProseField
      {...args}
      draft={draft}
      markdown={markdown}
      onChange={(next) => {
        setDraft(next);
        args.onChange(next);
      }}
      onMarkdown={(on) => {
        setMarkdown(on);
        args.onMarkdown(on);
      }}
    />
  );
}

const meta = {
  title: "Cards/ProseField",
  component: ProseField,
  args: {
    id: "story-theory",
    label: "Theory",
    role: "theory",
    draft: [
      {
        id: 0,
        value:
          "A **commit** records a snapshot of the project.\n\n- `git add` stages a change\n- `git commit` records it",
        tag: "en",
      },
    ],
    markdown: true,
    suggestions: ["en"],
    disabled: false,
    preview: fn((text: LangText, markdown: boolean) => (
      <DataProse class="course-theory" text={text} markdown={markdown} />
    )),
    onChange: fn(),
    onMarkdown: fn(),
  },
  render: (args) => <HeldField {...args} />,
  parameters: { controls: { exclude: ["draft", "missing", "preview"] } },
} satisfies Meta<typeof ProseField>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Theory in Markdown, previewed as the course player shows it; switching Markdown off says so. */
export const Markdown: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "Format with Markdown" }));
    await expect(args.onMarkdown).toHaveBeenCalledWith(false);
  },
};

/** Plain text, shown as typed. */
export const PlainText: Story = {
  args: {
    markdown: false,
    draft: [
      {
        id: 0,
        value: "A commit records a snapshot of the project.\n\nEach one names the one before it.",
        tag: "en",
      },
    ],
  },
};

/** Markdown that won't show as meant: a hint under the text. */
export const WithHints: Story = {
  args: {
    draft: [{ id: 0, value: 'See <a href="x">this</a> and ![a picture](pic.png).', tag: "en" }],
  },
};

/** Nothing written yet: the preview says so. Typing fills it. */
export const Empty: Story = {
  args: { draft: [{ id: 0, value: "", tag: "en" }] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Theory" }), "Hello");
    await expect(args.onChange).toHaveBeenCalled();
  },
};

/** The theory in English and Arabic, the translation's language still to choose. */
export const MultiLanguageMissing: Story = {
  args: {
    draft: [
      { id: 0, value: "A commit records a snapshot.", tag: "en" },
      { id: 1, value: "الإيداع يسجل لقطة من المشروع.", tag: null },
    ],
    missing: { id: 1, value: "الإيداع يسجل لقطة من المشروع.", tag: null },
    errorId: "story-theory-error",
  },
  render: (args) => (
    <>
      <HeldField {...args} />
      <ErrorMessage id="story-theory-error" error="Choose the language of the theory." />
    </>
  ),
};

/** While the draft saves: nothing can be changed. */
export const Disabled: Story = { args: { disabled: true } };
