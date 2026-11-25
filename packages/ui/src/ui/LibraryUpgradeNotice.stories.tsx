// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LibraryUpgradeNotice, ReleaseNotes } from "./LibraryUpgradeNotice";
import { bigUpgradePlan, upgradePlan } from "../test/stories/library";

const meta = {
  title: "Library/LibraryUpgradeNotice",
  component: LibraryUpgradeNotice,
  args: {
    deckName: "Capitals of the world",
    plan: upgradePlan,
    busy: false,
    error: null,
    onUpgrade: fn(),
  },
  parameters: { controls: { exclude: ["plan"] } },
} satisfies Meta<typeof LibraryUpgradeNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A newer release: what it adds, changes and removes, the card removed named; updated with its button. */
export const Offer: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Update to release 3" }),
    );
    await expect(args.onUpgrade).toHaveBeenCalled();
  },
};

/** A big update: many releases' notes, many cards retired (folded away), the deck studied both ways and renamed. */
export const BigUpdate: Story = { args: { plan: bigUpgradePlan } };

/** An update that touches only cards no longer studied. */
export const OutOfSight: Story = {
  args: {
    plan: { ...upgradePlan, add: [], change: [], remove: [], kept: [], notes: [] },
  },
};

/** A deck named in Arabic. */
export const ArabicDeck: Story = { args: { deckName: "تحيات عربية", deckLang: "ar" } };

/** The update in progress. */
export const Updating: Story = { args: { busy: true } };

/** The update failed. */
export const Failed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};

/** The release notes alone: more releases than are listed. */
export const ManyReleaseNotes: Story = {
  render: () => (
    <ReleaseNotes
      notes={Array.from({ length: 55 }, (_, index) => ({
        version: `${index + 2}`,
        notes: `Corrected capitals in release ${index + 2}.`,
      }))}
    />
  ),
};
