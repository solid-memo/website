// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { choicesOf, type CourseChapter } from "@solid-memo/domain/course";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { ChapterPlayerScreen } from "./ChapterPlayerScreen";
import { courseCards, courseOutline, noShuffle } from "../test/course";

/** The story course's first chapter: two steps, the second with two questions. */
const chapter = courseOutline.chapters[0]!;

/** A question's card and its options, in order. */
const card = courseCards[0]!;
const choices = choicesOf(card, noShuffle);

/** A chapter whose step's theory is Markdown in three parts, read one at a time. */
const chunkedChapter: CourseChapter = {
  ...chapter,
  title: { en: "Linked data, and how the web of data names the things it describes" },
  steps: [
    {
      ...chapter.steps[0]!,
      textFormat: SM.markdown,
      theory: {
        en: "Things are named by **IRIs**.\n\n---\n\nA triple has three terms:\n\n- a subject\n- a predicate\n- an object\n\n---\n\nTurtle writes them down:\n\n```turtle\n<#me> foaf:knows <#you> .\n```",
      },
    },
  ],
};

/** A chapter titled, and taught, in Arabic, right to left. */
const arabicChapter: CourseChapter = {
  ...chapter,
  title: { ar: "التحيات" },
  steps: [{ ...chapter.steps[0]!, theory: { ar: "«مرحبا» تحية تقال في أي وقت من اليوم." } }],
};

const meta = {
  title: "Courses/ChapterPlayerScreen",
  component: ChapterPlayerScreen,
  args: {
    chapter,
    stepIndex: 0,
    phase: "read",
    questionIndex: 0,
    chunkIndex: 0,
    card,
    choices,
    answer: null,
    busy: false,
    error: null,
    onAnswerPhase: fn(),
    onChunk: fn(),
    onCheck: fn(),
    lastLabel: "On to the final review",
    onNext: fn(),
  },
  parameters: { controls: { exclude: ["chapter", "card", "choices", "answer", "error"] } },
} satisfies Meta<typeof ChapterPlayerScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A step's theory, with the way on to its question. */
export const Theory: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "On to the question" }),
    );
    await expect(args.onAnswerPhase).toHaveBeenCalled();
  },
};

/** Markdown theory in parts, the second shown: Back and Continue. */
export const TheoryInParts: Story = {
  args: { chapter: chunkedChapter, chunkIndex: 1 },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue" }));
    await expect(args.onChunk).toHaveBeenCalledWith(2);
  },
};

/** A step's question, the theory not shown. */
export const Question: Story = { args: { phase: "answer" } };

/** The second of a step's two questions, answered wrong. */
export const AnsweredWrong: Story = {
  args: {
    stepIndex: 1,
    phase: "answer",
    questionIndex: 1,
    card: courseCards[2]!,
    choices: choicesOf(courseCards[2]!, noShuffle),
    answer: { choice: choicesOf(courseCards[2]!, noShuffle)[1]!, effect: "review" },
  },
};

/** The chapter's last question answered right: on to the final review. */
export const LastQuestionAnswered: Story = {
  args: {
    stepIndex: 1,
    phase: "answer",
    questionIndex: 1,
    card: courseCards[2]!,
    choices: choicesOf(courseCards[2]!, noShuffle),
    answer: { choice: choicesOf(courseCards[2]!, noShuffle)[0]!, effect: "introduce" },
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "On to the final review" }),
    );
    await expect(args.onNext).toHaveBeenCalled();
  },
};

/** The answer couldn't be saved. */
export const SaveFailed: Story = {
  args: {
    phase: "answer",
    error: "The server did not answer in time. Check your connection and try again.",
  },
};

/** A chapter in Arabic, right to left. */
export const Arabic: Story = { args: { chapter: arabicChapter } };
