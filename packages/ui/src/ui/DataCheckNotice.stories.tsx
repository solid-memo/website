// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import { DataCheckNotice } from "./DataCheckNotice";
import { storyInstance } from "../test/storyData";
import { failingReport } from "../test/stories/library";

/** More decks set aside than the notice names. */
const manySetAside = Array.from({ length: 55 }, (_, index) => ({
  en: `Practice deck ${index + 1}`,
}));

const meta = {
  title: "Library/DataCheckNotice",
  component: DataCheckNotice,
  args: {
    instance: storyInstance,
    report: failingReport,
    policy: "block-subject",
    setAside: [{ en: "Capitals of the world" }, { en: "Arabic greetings", ar: "تحيات عربية" }],
    arrangementSetAside: false,
  },
  parameters: { controls: { exclude: ["instance", "report", "setAside"] } },
} satisfies Meta<typeof DataCheckNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two decks set aside; the problems opened, document by document. */
export const SetAside: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("The problems, document by document"));
    await expect(await canvas.findByText(/Unexpected token on line 3/)).toBeInTheDocument();
  },
};

/** More decks set aside than are named, and the deck list's arrangement too. */
export const ManySetAside: Story = {
  args: { setAside: manySetAside, arrangementSetAside: true },
};

/** Set aside is the policy, but no deck is: the rest keeps working. */
export const NothingSetAside: Story = { args: { setAside: [] } };

/** The policy blocks the whole instance. */
export const BlockInstance: Story = { args: { policy: "block-instance", setAside: [] } };

/** The policy only warns. */
export const WarnOnly: Story = { args: { policy: "warn-only", setAside: [] } };
