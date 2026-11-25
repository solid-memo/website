// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { CourseChapter } from "@solid-memo/domain/course";
import { CoursePreviewScreen } from "./CoursePreviewScreen";
import { courseOutline } from "../test/course";

/** More chapters than the list shows, their titles long enough to wrap. */
const manyChapters: CourseChapter[] = Array.from({ length: 30 }, (_, at) => ({
  ...courseOutline.chapters[0]!,
  id: `many-${at}`,
  url: `${courseOutline.releaseUrl}#many-${at}`,
  position: at,
  title: { en: `Chapter ${at + 1}: resources, their descriptions and the vocabularies they use` },
}));

const meta = {
  title: "Courses/CoursePreviewScreen",
  component: CoursePreviewScreen,
  args: {
    courseName: "Solid fundamentals",
    courseHref: "#/library-deck?deck=solid",
    chapters: courseOutline.chapters,
    chapterHref: fn(() => "#/library-preview?deck=solid"),
    children: undefined,
    onExit: fn(),
  },
  parameters: { controls: { exclude: ["chapters", "children"] } },
} satisfies Meta<typeof CoursePreviewScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A course's chapters, each linked to its preview. */
export const Chapters: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Back to library" }));
    await expect(args.onExit).toHaveBeenCalled();
  },
};

/** A chapter opened, under a link back to the chapters. */
export const ChapterOpened: Story = {
  render: (args) => (
    <CoursePreviewScreen {...args}>
      <p>The chapter, as the course plays it.</p>
    </CoursePreviewScreen>
  ),
};

/** More chapters than the list shows: how many more there are. */
export const ManyChapters: Story = { args: { chapters: manyChapters } };

/** A course with no chapters. */
export const Empty: Story = { args: { chapters: [] } };

/** A course named in Arabic, right to left. */
export const ArabicName: Story = { args: { courseName: "أساسيات سوليد", courseLang: "ar" } };
