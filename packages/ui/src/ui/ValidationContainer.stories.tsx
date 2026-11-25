// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { ValidationContainer } from "./ValidationContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";
import { conformingReport, failingReport } from "../test/stories/library";

const meta = {
  title: "Library/ValidationContainer",
  component: ValidationContainer,
  args: {
    useCases: makeUseCasesFake({ validateInstance: fn(async () => failingReport) }),
    instance: storyInstance,
  },
  parameters: { controls: { exclude: ["useCases", "instance"] } },
} satisfies Meta<typeof ValidationContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The instance's documents checked: problems found; checked again on request. */
export const Problems: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("3 violations in 2 documents.")).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Validate again" }));
    await waitFor(() => expect(args.useCases.validateInstance).toHaveBeenCalledTimes(2));
  },
};

/** Every document conforms. */
export const Conforms: Story = {
  args: { useCases: makeUseCasesFake({ validateInstance: fn(async () => conformingReport) }) },
};

/** The check under way. */
export const Validating: Story = {
  args: {
    useCases: makeUseCasesFake({ validateInstance: fn(() => new Promise<never>(() => {})) }),
  },
};

/** The check couldn't be made. */
export const Failed: Story = {
  args: {
    useCases: makeUseCasesFake({
      validateInstance: fn(async () => {
        throw new AppError("podNoAnswer");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/did not answer in time/),
    ).toBeInTheDocument();
  },
};
