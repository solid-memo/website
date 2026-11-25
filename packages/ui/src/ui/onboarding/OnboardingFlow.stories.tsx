// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { POD_PROVIDERS } from "@solid-memo/domain/podProvider";
import { MakerNote } from "./MakerNote";
import { OnboardingFlow } from "./OnboardingFlow";

const meta = {
  title: "Onboarding/OnboardingFlow",
  component: OnboardingFlow,
  args: {
    providers: POD_PROVIDERS,
    busy: false,
    returning: false,
    onLogin: fn(),
    onLoginWithProvider: fn(),
    onTryAsGuest: fn(),
    note: null,
  },
  parameters: { controls: { exclude: ["providers", "note"] } },
} satisfies Meta<typeof OnboardingFlow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new visitor: try as a guest, why the app was made, log in, create a Pod. */
export const NewVisitor: Story = {
  render: (args) => <OnboardingFlow {...args} note={<MakerNote />} />,
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Try it without logging in" }),
    );
    await expect(args.onTryAsGuest).toHaveBeenCalledOnce();
  },
};

/** Someone who logged out here: logging in comes first, without the note. */
export const Returning: Story = { args: { returning: true } };

/** Logging in at a provider in one click. */
export const LogInAtProvider: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: POD_PROVIDERS[0]!.name }),
    );
    await expect(args.onLoginWithProvider).toHaveBeenCalledWith(POD_PROVIDERS[0]);
  },
};

/** No guest's study offered, and no provider that takes sign-ups: only logging in. */
export const LoginOnly: Story = {
  args: {
    onTryAsGuest: undefined,
    providers: [{ id: "login", name: "Login Only Pods", oidcIssuer: "https://pod.example/" }],
  },
};

/** Redirecting to the identity provider: every way in is disabled. */
export const Busy: Story = { args: { busy: true } };
