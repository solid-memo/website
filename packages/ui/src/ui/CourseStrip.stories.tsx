// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, waitFor, within } from "storybook/test";
import { CourseStrip, CourseStripContainer, type CourseStripEntry } from "./CourseStrip";
import { makeUseCasesFake } from "../test/useCasesFake";
import { courseDeck, courseInstance, courseOutline, makeCourse } from "../test/course";

/** Courses still to finish: one under way, one not started, one long, one in Arabic. */
const entries: CourseStripEntry[] = [
  {
    key: "solid",
    title: { en: "Solid fundamentals" },
    href: "#/course?deck=solid",
    continueHref: "#/chapter?deck=solid",
    started: true,
    done: 1,
    count: 2,
  },
  {
    key: "hangul",
    title: { en: "Reading Hangul", ko: "한글 읽기" },
    href: "#/course?deck=hangul",
    continueHref: "#/chapter?deck=hangul",
    started: false,
    done: 0,
    count: 6,
  },
  {
    key: "public-code",
    title: {
      en: "The Standard for Public Code, criterion by criterion, with what each asks of a codebase",
    },
    href: "#/course?deck=public-code",
    continueHref: "#/chapter?deck=public-code",
    started: true,
    done: 12,
    count: 16,
  },
  {
    key: "arabic",
    title: { ar: "التحيات العربية" },
    href: "#/course?deck=arabic",
    continueHref: "#/chapter?deck=arabic",
    started: true,
    done: 2,
    count: 5,
  },
];

/** A course deck's summary, and the whole course, read behind the strip. */
const stripUseCases = makeUseCasesFake({
  getCourseSummary: fn(async () => ({ outline: courseOutline, answeredCardIds: ["q-1"] })),
  getCourse: fn(async () => makeCourse(["q-1"])),
});

const meta = {
  title: "Courses/CourseStrip",
  component: CourseStrip,
  args: { entries },
  parameters: { controls: { exclude: ["entries"] } },
} satisfies Meta<typeof CourseStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The courses to go on with, above the deck list. */
export const Courses: Story = {};

/** Nothing but courses: a line points to the deck library. */
export const OnlyCourses: Story = {
  args: { entries: entries.slice(0, 1), libraryHref: "#/library" },
};

/** No course to go on with: nothing shown. */
export const NoCourses: Story = { args: { entries: [] } };

/** The strip as the deck list reads it, from a course deck's summary. */
export const Container: Story = {
  render: () => (
    <CourseStripContainer
      useCases={stripUseCases}
      instance={courseInstance}
      decks={[courseDeck]}
      libraryHref="#/library"
    />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", { name: "Solid fundamentals" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(stripUseCases.getCourse).toHaveBeenCalled());
  },
};
