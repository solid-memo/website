// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ThemeProvider } from "./theme";
import { ThemeToggle } from "./ThemeToggle";

/** The theme a press chooses. */
const onChoose = fn();

const meta = {
  title: "Basics/ThemeToggle",
  component: ThemeToggle,
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

/** In the light theme: a sun, and a press switches to dark. */
export const Light: Story = {
  render: () => (
    <ThemeProvider choice="light" onChoose={onChoose}>
      <ThemeToggle />
    </ThemeProvider>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Switch to dark mode" }),
    );
    await expect(onChoose).toHaveBeenCalledWith("dark");
  },
};

/** In the dark theme: a moon, named for the light theme it switches to. */
export const Dark: Story = {
  render: () => (
    <ThemeProvider choice="dark" onChoose={onChoose}>
      <ThemeToggle />
    </ThemeProvider>
  ),
};
