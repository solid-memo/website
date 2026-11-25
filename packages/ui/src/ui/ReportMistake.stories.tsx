// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { ReportMistake } from "./ReportMistake";

const meta = {
  title: "Basics/ReportMistake",
  component: ReportMistake,
  args: {
    place: { library: true },
    releaseUrl: "https://pod.example/releases/kanji/1.2.0/",
    cardId: "sun",
  },
} satisfies Meta<typeof ReportMistake>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A library release's card: the repository's deck issue form. */
export const LibraryRelease: Story = {};

/** A release from a link: its own contact page, with its host beside it. */
export const LinkedRelease: Story = {
  args: { place: { library: false, contact: "https://pod.example/kanji/contact" } },
};

/** A release from a link that names no contact page: nothing is shown. */
export const NowhereToReport: Story = { args: { place: { library: false } } };
