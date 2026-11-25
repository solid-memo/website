// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { FramedPage } from "./Framed";

const meta = {
  title: "Basics/Framed",
  component: FramedPage,
  args: { locale: "en", appName: "Solid Memo", href: "https://pod.example/memo/" },
} satisfies Meta<typeof FramedPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** What the site shows in a frame of another page: it opens only on its own. */
export const InAFrame: Story = {};

/** The same, in the language the learner chose on this device (Swedish). */
export const Swedish: Story = { args: { locale: "sv" } };
