// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import type { OldRegistrations } from "@solid-memo/domain/instance";
import { OldRegistrationsContainer } from "./OldRegistrationsContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";

/** Registrations earlier versions wrote, in both type indexes. */
const OLD: OldRegistrations = {
  registrations: [
    { dataClass: "deck", index: "private" },
    { dataClass: "card", index: "private" },
    { dataClass: "reviewState", index: "private" },
    { dataClass: "catalog", index: "public" },
  ],
  unreadableIndexes: [],
};

/** Whether the story's old registrations were removed, so none are found. */
let removed = false;

const meta = {
  title: "Instances/OldRegistrationsContainer",
  component: OldRegistrationsContainer,
  args: {
    useCases: makeUseCasesFake({
      oldRegistrations: fn(async () =>
        removed ? { registrations: [], unreadableIndexes: [] } : OLD,
      ),
      removeOldRegistrations: fn(async () => {
        removed = true;
      }),
    }),
    session: { webId: "https://pod.example/profile/card#me" },
    instance: storyInstance,
  },
  parameters: { controls: { exclude: ["useCases", "session"] } },
  beforeEach: () => {
    removed = false;
  },
} satisfies Meta<typeof OldRegistrationsContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Old registrations in both type indexes, removed: the note says so and takes the focus. */
export const Registrations: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button"));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveFocus());
  },
};

/** One type index couldn't be read: what it holds is not known. */
export const UnreadableIndex: Story = {
  args: {
    useCases: makeUseCasesFake({
      oldRegistrations: fn(async () => ({
        registrations: OLD.registrations.slice(0, 3),
        unreadableIndexes: ["public" as const],
      })),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("heading")).toBeInTheDocument();
  },
};

/** The registrations being removed. */
export const Removing: Story = {
  args: {
    useCases: makeUseCasesFake({
      oldRegistrations: fn(async () => OLD),
      removeOldRegistrations: fn(() => new Promise<never>(() => {})),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button"));
    await expect(await canvas.findByRole("button", { name: /removing/i })).toBeDisabled();
  },
};

/** Removing the registrations failed. */
export const RemoveFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      oldRegistrations: fn(async () => OLD),
      removeOldRegistrations: fn(async () => {
        throw new AppError("writeRefused");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button"));
    await expect(await canvas.findByText(/stopped a change/)).toBeInTheDocument();
  },
};

/** None left, as most users have: nothing is shown. */
export const None: Story = {
  args: { useCases: makeUseCasesFake() },
};
