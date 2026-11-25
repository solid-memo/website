// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, within } from "storybook/test";
import { courseProgress, type CourseOutline } from "@solid-memo/domain/course";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CourseScreen } from "./CourseScreen";
import { CH1, CH2, courseLibraryDeck, courseOutline, RELEASE } from "../test/course";

/** Every question of the story course. */
const allAnswered = ["q-1", "q-2", "q-3", "r-1", "q-4"];

/** A course of forty chapters, each with a step of one question, its first described in Markdown. */
const longOutline: CourseOutline = {
  releaseUrl: RELEASE,
  chapters: Array.from({ length: 40 }, (_, at) => ({
    id: `long-${at}`,
    url: `${RELEASE}#long-${at}`,
    position: at,
    title: { en: `Chapter ${at + 1}: a title of some length, to see how it wraps on a phone` },
    description: { en: "Names, *links* and `<#me>`." },
    textFormat: SM.markdown,
    steps: [
      {
        id: `long-step-${at}`,
        url: `${RELEASE}#long-step-${at}`,
        position: 0,
        theory: { en: "Theory." },
        questionIds: [`long-q-${at}`],
      },
    ],
    reviewQuestionIds: [],
  })),
};

/** The first twenty chapters of the long course completed. */
const longCompleted = longOutline.chapters.slice(0, 20).map((chapter) => chapter.url);

const meta = {
  title: "Courses/CourseScreen",
  component: CourseScreen,
  args: {
    title: courseLibraryDeck.title,
    description: { en: "A course on Solid: linked data, pods and the apps that read them." },
    outline: courseOutline,
    progress: courseProgress(courseOutline, [], []),
    started: false,
    chapterHref: fn(() => "#/course/chapter"),
    continueHref: "#/course/chapter",
    decksHref: "#/decks",
    libraryHref: "#/library",
    preferencesHref: "#/course/preferences",
    notice: null,
  },
  parameters: { controls: { exclude: ["outline", "progress", "notice", "justCompleted"] } },
} satisfies Meta<typeof CourseScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A course not started yet: its first chapter open, the rest locked. */
export const NotStarted: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "Start the course" }),
    ).toBeInTheDocument();
  },
};

/** Half way through: the first chapter's steps done, its final review to go. */
export const InProgress: Story = {
  args: { progress: courseProgress(courseOutline, ["q-1", "q-2", "q-3"], []), started: true },
};

/** Back from a chapter just completed: a cheer, and its Done badge sparkles. */
export const ChapterJustCompleted: Story = {
  args: {
    progress: courseProgress(courseOutline, ["q-1", "q-2", "q-3", "r-1"], [CH1]),
    started: true,
    justCompleted: { chapterUrl: CH1, finishedCourse: false },
  },
};

/** The last chapter completed: the course is finished, with confetti. */
export const Finished: Story = {
  args: {
    progress: courseProgress(courseOutline, allAnswered, [CH1, CH2]),
    started: true,
    continueHref: undefined,
    justCompleted: { chapterUrl: CH2, finishedCourse: true },
  },
};

/** The course's deck is paused: no way on. */
export const Paused: Story = {
  args: { progress: courseProgress(courseOutline, ["q-1"], []), started: true, paused: true },
};

/** A newer release on offer, under the blurb. */
export const WithNotice: Story = {
  render: (args) => (
    <CourseScreen
      {...args}
      notice={<p class="hint">A newer release of this course is in the library.</p>}
    />
  ),
};

/** A long course: a window of chapters around the one open, Markdown descriptions. */
export const ManyChapters: Story = {
  args: {
    outline: longOutline,
    progress: courseProgress(longOutline, [], longCompleted),
    started: true,
  },
};

/** In the Studio's trial: no decks, library or preferences to link to. */
export const Trial: Story = {
  args: {
    progress: courseProgress(courseOutline, allAnswered, [CH1, CH2]),
    continueHref: undefined,
    decksHref: undefined,
    libraryHref: undefined,
    preferencesHref: undefined,
  },
};
