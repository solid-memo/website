// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { UpdateProgress } from "@solid-memo/domain/instanceUpdate";
import { MigrationContainer } from "./MigrationContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { outdatedPlan, unfinishedUpdate, upToDatePlan } from "../test/stories/instances";
import { storyInstance } from "../test/storyData";

/** Whether the story's update ran, so the instance is up to date. */
let updated = false;

const meta = {
  title: "Instances/MigrationContainer",
  component: MigrationContainer,
  args: {
    useCases: makeUseCasesFake({ planMigration: fn(async () => outdatedPlan) }),
    session: { webId: "https://pod.example/profile/card#me" },
    instance: storyInstance,
  },
  parameters: { controls: { exclude: ["useCases", "session"] } },
} satisfies Meta<typeof MigrationContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Documents in older formats: the update offered, then confirmed and cancelled. */
export const Offered: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /update/i }));
    await userEvent.click(await canvas.findByRole("button", { name: /not now/i }));
    await expect(await canvas.findByRole("button", { name: /update/i })).toBeInTheDocument();
  },
};

/** The update writing the documents, one by one. */
export const Updating: Story = {
  args: {
    useCases: makeUseCasesFake({
      planMigration: fn(async () => outdatedPlan),
      updateInstance: fn((_session, _instance, onProgress: (progress: UpdateProgress) => void) => {
        onProgress({ step: "write", done: 1, total: 2, part: { done: 4, total: 9 } });
        return new Promise<never>(() => {});
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /update/i }));
    await userEvent.click(await canvas.findByRole("button", { name: /start/i }));
    await expect(await canvas.findByRole("progressbar")).toBeInTheDocument();
  },
};

/** The update done: everything up to date. */
export const Done: Story = {
  args: {
    useCases: makeUseCasesFake({
      planMigration: fn(async () => (updated ? upToDatePlan : outdatedPlan)),
      updateInstance: fn(async () => {
        updated = true;
        return { updated: [], failed: [] };
      }),
    }),
  },
  beforeEach: () => {
    updated = false;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /update/i }));
    await userEvent.click(await canvas.findByRole("button", { name: /start/i }));
    await expect(await canvas.findByRole("status")).toBeInTheDocument();
  },
};

/** The update left some documents as they were; the result closed. */
export const Unfinished: Story = {
  args: {
    useCases: makeUseCasesFake({
      planMigration: fn(async () => outdatedPlan),
      updateInstance: fn(async () => unfinishedUpdate),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /update/i }));
    await userEvent.click(await canvas.findByRole("button", { name: /start/i }));
    await userEvent.click(await canvas.findByRole("button", { name: /close/i }));
    await expect(await canvas.findByRole("region")).toHaveFocus();
  },
};

/** The update failed before it wrote anything. */
export const UpdateFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      planMigration: fn(async () => outdatedPlan),
      updateInstance: fn(async () => {
        throw new AppError("writeRefused");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /update/i }));
    await userEvent.click(await canvas.findByRole("button", { name: /start/i }));
    await expect(await canvas.findByText(/stopped a change/)).toBeInTheDocument();
  },
};
