// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { choicesOf } from "@solid-memo/domain/course";
import type { CardContent } from "@solid-memo/domain/deck";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CourseQuestion } from "./CourseQuestion";
import { courseCards, noShuffle } from "../test/course";

/** A question, its right answer noted, and two wrong options, the first explained. */
const card = courseCards[0]!;
const choices = choicesOf(card, noShuffle);
const [right, explained] = choices as [(typeof choices)[0], (typeof choices)[0]];

/** A question asked in Arabic, right to left. */
const arabicQuestion: CardContent = {
  front: { ar: "ما معنى «مرحبا»؟" },
  back: { en: "Hello" },
  distractors: [
    { id: "ar-d1", text: { en: "Goodbye" }, note: { en: "Goodbye is «مع السلامة»." } },
    { id: "ar-d2", text: { en: "Thank you" } },
  ],
};

/** A question in Markdown, with a code block, and options long enough to wrap. */
const markdownQuestion: CardContent = {
  textFormat: SM.markdown,
  front: { en: "What does this Turtle say?\n\n```turtle\n<#me> foaf:knows <#you> .\n```" },
  back: { en: "That the subject `<#me>` knows the object `<#you>`, by the FOAF vocabulary's term" },
  distractors: [
    { id: "md-d1", text: { en: "That `<#you>` knows `<#me>`, as links in RDF run both ways" } },
    { id: "md-d2", text: { en: "Nothing: a triple needs a literal as its object" } },
  ],
};

const meta = {
  title: "Courses/CourseQuestion",
  component: CourseQuestion,
  args: {
    card,
    choices,
    answer: null,
    focusQuestion: false,
    busy: false,
    error: null,
    nextLabel: "Next",
    onCheck: fn(),
    onNext: fn(),
  },
  parameters: { controls: { exclude: ["card", "choices", "answer", "error"] } },
} satisfies Meta<typeof CourseQuestion>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A question asked: an option picked and checked. */
export const Unanswered: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "An IRI" }));
    await userEvent.click(canvas.getByRole("button", { name: "Check" }));
    await expect(args.onCheck).toHaveBeenCalledWith(right, expect.any(Number));
  },
};

/** Answered right, the card added to the learner's deck, the right answer's note shown. */
export const Right: Story = {
  args: { answer: { choice: right, effect: "introduce" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Next" }));
    await expect(args.onNext).toHaveBeenCalled();
  },
};

/** Answered wrong: why the option chosen is wrong, and the right answer. */
export const Wrong: Story = {
  args: { answer: { choice: explained, effect: "review" }, nextLabel: "Final review" },
};

/** A question in Arabic, right to left. */
export const Arabic: Story = {
  args: { card: arabicQuestion, choices: choicesOf(arabicQuestion, noShuffle) },
};

/** A question in Markdown with a code block, and options that wrap. */
export const Markdown: Story = {
  args: { card: markdownQuestion, choices: choicesOf(markdownQuestion, noShuffle) },
};

/** The answer being saved: Check waits. */
export const Saving: Story = { args: { busy: true } };

/** The answer couldn't be saved. */
export const SaveFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};
