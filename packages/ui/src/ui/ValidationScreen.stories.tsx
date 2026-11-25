// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { ValidationScreen, ViolationMessage } from "./ValidationScreen";
import { conformingReport, failingReport, longReport } from "../test/stories/library";

const meta = {
  title: "Library/ValidationScreen",
  component: ValidationScreen,
  args: { report: failingReport },
  parameters: { controls: { exclude: ["report"] } },
} satisfies Meta<typeof ValidationScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Violations, a DCAT-AP warning, a stray subject, a newer format and an unreadable document. */
export const Problems: Story = {};

/** Every document conforms, one not created yet. */
export const Conforms: Story = { args: { report: conformingReport } };

/** Only what is wrong, as the data check's notice shows it, without the summary line. */
export const ProblemsOnly: Story = {
  args: { report: failingReport, problemsOnly: true, summary: false },
};

/** More documents than a page shows: the next ones shown on request. */
export const LongReport: Story = {
  args: { report: longReport },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Show 10 more" }));
    await expect(canvas.queryByRole("button", { name: /Show \d+ more/ })).not.toBeInTheDocument();
  },
};

/** One result's message alone, in the reader's language where the shape gives it. */
export const Message: Story = {
  render: () => (
    <p>
      <ViolationMessage
        violation={{
          message: { en: "A deck has a title.", sv: "En kortlek har en titel." },
          severity: "violation",
          constraint: "MinCount",
        }}
      />
    </p>
  ),
};
