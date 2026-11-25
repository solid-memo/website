// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import { SchedulerInvitation, SchedulerInvitationContainer } from "./SchedulerInvitation";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyInstance } from "../test/storyData";

const meta = {
  title: "Study/SchedulerInvitation",
  component: SchedulerInvitation,
  args: { busy: false, error: null, onSwitch: fn(), onDismiss: fn() },
  parameters: { controls: { exclude: ["error"] } },
} satisfies Meta<typeof SchedulerInvitation>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The invitation to switch to FSRS-6, with its two answers. */
export const Invitation: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Not now" }));
    await expect(args.onDismiss).toHaveBeenCalled();
  },
};

/** Not now being saved: the buttons wait. */
export const Busy: Story = { args: { busy: true } };

/** Not now couldn't be saved. */
export const DismissFailed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
};

/** Above the deck list, on SM-2: switching shows how it went. */
export const Container: Story = {
  render: () => (
    <SchedulerInvitationContainer
      useCases={makeUseCasesFake({ getPreferences: fn(async () => DEFAULT_PREFERENCES) })}
      instance={storyInstance}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: /Switch to FSRS-6/ }));
    await expect(
      await canvas.findByRole("region", { name: "Switched to FSRS-6" }),
    ).toBeInTheDocument();
  },
};
