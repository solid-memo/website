// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { Confetti } from "./Confetti";

const meta = {
  title: "Basics/Confetti",
  component: Confetti,
} satisfies Meta<typeof Confetti>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Confetti for a course just completed: three shooters pop once and it is gone (reload the story to see it again; nothing shows with motion reduced). */
export const Celebration: Story = {};
