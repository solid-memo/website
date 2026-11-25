// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { MigrationNotice } from "./MigrationNotice";
import { manyDecksPlan, outdatedPlan, upToDatePlan } from "../test/stories/instances";

const meta = {
  title: "Instances/MigrationNotice",
  component: MigrationNotice,
  args: { plan: outdatedPlan, busy: false, error: null, onMigrate: fn() },
} satisfies Meta<typeof MigrationNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Everything in the first formats: the record, catalog, preferences and decks, with what's new; the update asked for. */
export const Outdated: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/new/i, { selector: "summary" }));
    await userEvent.click(canvas.getByRole("button", { name: /update/i }));
    await expect(args.onMigrate).toHaveBeenCalled();
  },
};

/** Only the preferences to update. */
export const PreferencesOnly: Story = {
  args: {
    plan: {
      ...upToDatePlan,
      preferencesOutdated: true,
      oldestFormat: { ...upToDatePlan.oldestFormat, preferences: 3 },
    },
  },
};

/** More outdated decks than the notice lists. */
export const ManyDecks: Story = { args: { plan: manyDecksPlan } };

/** Back from the confirmation: the notice takes the focus. */
export const Returned: Story = {
  args: { focus: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("region")).toHaveFocus();
  },
};

/** The update running. */
export const Updating: Story = { args: { busy: true } };

/** The update failed. */
export const UpdateFailed: Story = {
  args: {
    error:
      "Solid Memo stopped a change to your Pod for safety: it would have been saved at an address Solid Memo never saves to. Nothing was changed.",
  },
};
