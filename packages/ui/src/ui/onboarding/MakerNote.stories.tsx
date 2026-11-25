// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { MakerNote } from "./MakerNote";

const meta = {
  title: "Onboarding/MakerNote",
  component: MakerNote,
} satisfies Meta<typeof MakerNote>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Why Solid Memo was made, in its maker's words, signed. */
export const Note: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("— Anton Wiklund")).toBeInTheDocument();
  },
};
