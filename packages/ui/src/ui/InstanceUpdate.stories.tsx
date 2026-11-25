// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import {
  InstanceUpdateConfirm,
  InstanceUpdateProgress,
  InstanceUpdateResult,
} from "./InstanceUpdate";
import { unfinishedUpdate } from "../test/stories/instances";
import { storyDeck } from "../test/storyData";

const meta = {
  title: "Instances/InstanceUpdate",
  component: InstanceUpdateConfirm,
  args: { instanceName: "My study", onStart: fn(), onCancel: fn() },
} satisfies Meta<typeof InstanceUpdateConfirm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Before the update: how it keeps the data safe; started. */
export const Confirm: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /start/i }));
    await expect(args.onStart).toHaveBeenCalled();
  },
};

/** The update reading the instance's documents. */
export const Reading: Story = {
  render: () => <InstanceUpdateProgress progress={{ step: "read", done: 0, total: 2 }} />,
};

/** The update writing the documents, some of them done. */
export const Writing: Story = {
  render: () => (
    <InstanceUpdateProgress
      progress={{ step: "write", done: 1, total: 2, part: { done: 7, total: 12 } }}
    />
  ),
};

/** Documents the update couldn't update, each with why; tried again. */
export const Unfinished: Story = {
  args: { onStart: fn() },
  render: (args) => (
    <InstanceUpdateResult
      outcome={unfinishedUpdate}
      onRetry={args.onStart}
      onDismiss={args.onCancel}
    />
  ),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /try again/i }));
    await expect(args.onStart).toHaveBeenCalled();
  },
};

/** More documents left than the result lists, none updated. */
export const ManyLeft: Story = {
  render: (args) => (
    <InstanceUpdateResult
      outcome={{
        updated: [],
        failed: Array.from({ length: 60 }, (_, at) => {
          const deck = storyDeck(`deck-${at}`, { en: `Deck ${at + 1}` });
          return {
            url: deck.cardsDocumentUrl,
            holds: "cards" as const,
            deck: deck.title,
            error: new AppError("changedElsewhere"),
          };
        }),
      }}
      onRetry={args.onStart}
      onDismiss={args.onCancel}
    />
  ),
};
