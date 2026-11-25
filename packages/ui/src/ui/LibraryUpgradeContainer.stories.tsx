// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { LibraryUpgradeContainer } from "./LibraryUpgradeContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";
import { importedCapitals, upgradePlan } from "../test/stories/library";

const meta = {
  title: "Library/LibraryUpgradeContainer",
  component: LibraryUpgradeContainer,
  args: {
    useCases: makeUseCasesFake({ planLibraryUpgrade: fn(async () => upgradePlan) }),
    instance: storyInstance,
    deck: importedCapitals,
  },
  parameters: { controls: { exclude: ["useCases", "instance", "deck"] } },
} satisfies Meta<typeof LibraryUpgradeContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A newer release offered, and the update applied with its plan. */
export const Offer: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Update to release 3" }));
    await waitFor(() =>
      expect(args.useCases.applyLibraryUpgrade).toHaveBeenCalledWith(
        importedCapitals,
        upgradePlan,
        expect.any(Function),
      ),
    );
  },
};

/** The update running: its steps. */
export const Updating: Story = {
  args: {
    useCases: makeUseCasesFake({
      planLibraryUpgrade: fn(async () => upgradePlan),
      applyLibraryUpgrade: fn(() => new Promise<never>(() => {})),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Update to release 3" }));
    await expect(
      await canvas.findByRole("region", { name: "Updating the deck" }),
    ).toBeInTheDocument();
  },
};

/** An update that failed part-way: where, and that the deck is as it was. */
export const Failed: Story = {
  args: {
    useCases: makeUseCasesFake({
      planLibraryUpgrade: fn(async () => upgradePlan),
      applyLibraryUpgrade: fn(async () => ({
        ok: false as const,
        step: "cards" as const,
        error: new AppError("podNoAnswer"),
        changed: false,
      })),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Update to release 3" }));
    await expect(await canvas.findByRole("region", { name: "Update failed" })).toBeInTheDocument();
  },
};

/** The library has nothing newer: nothing shown. */
export const NothingNewer: Story = {
  args: { useCases: makeUseCasesFake() },
};
