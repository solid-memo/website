// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { GUEST_INSTANCE_URL } from "@solid-memo/domain/guest";
import { InterruptedMoveContainer } from "./InterruptedMoveContainer";
import { makeUseCasesFake } from "../test/useCasesFake";

/** The partial copy a closed tab left in the user's pod. */
const LEFTOVER = "https://pod.example/solid-memo/main/";

/** Whether the story's partial copy was removed, so it is no longer found. */
let removed = false;

const meta = {
  title: "Instances/InterruptedMoveContainer",
  component: InterruptedMoveContainer,
  args: {
    useCases: makeUseCasesFake({
      findInterruptedGuestMove: fn(async () => (removed ? null : LEFTOVER)),
      removeInterruptedGuestMove: fn(async () => {
        removed = true;
      }),
    }),
    session: { webId: "https://pod.example/profile/card#me" },
    instance: { url: GUEST_INSTANCE_URL, name: "Trying it out" },
  },
  parameters: { controls: { exclude: ["useCases", "session"] } },
} satisfies Meta<typeof InterruptedMoveContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A move cut off half-way: the partial copy, removed; the panel goes. */
export const Leftover: Story = {
  beforeEach: () => {
    removed = false;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button"));
    await waitFor(() => expect(canvas.queryByRole("region")).toBeNull());
  },
};

/** The partial copy being removed. */
export const Removing: Story = {
  args: {
    useCases: makeUseCasesFake({
      findInterruptedGuestMove: fn(async () => LEFTOVER),
      removeInterruptedGuestMove: fn(() => new Promise<never>(() => {})),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button"));
    await expect(await canvas.findByRole("button", { name: /removing/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  },
};

/** Removing the partial copy failed. */
export const RemoveFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      findInterruptedGuestMove: fn(async () => LEFTOVER),
      removeInterruptedGuestMove: fn(async () => {
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

/** No move of this instance was cut off: nothing is shown. */
export const NoLeftover: Story = {
  args: { useCases: makeUseCasesFake() },
  play: async ({ args }) => {
    await waitFor(() => expect(args.useCases.findInterruptedGuestMove).toHaveBeenCalled());
  },
};
