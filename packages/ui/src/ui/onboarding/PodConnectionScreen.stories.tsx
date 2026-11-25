// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import type { SolidAccount } from "@solid-memo/domain/account";
import { PodConnectionScreen } from "./PodConnectionScreen";

const account: SolidAccount = {
  webId: "https://pod.example/alice/profile/card#me",
  name: "Alice",
  podUrl: "https://pod.example/alice/",
  oidcIssuer: "https://pod.example/",
};

const meta = {
  title: "Onboarding/PodConnectionScreen",
  component: PodConnectionScreen,
  args: {
    account,
    busy: false,
    error: null,
    offerSkip: false,
    onRetry: fn(),
    onContinue: fn(),
    onLogout: fn(),
  },
  parameters: { controls: { exclude: ["account"] } },
} satisfies Meta<typeof PodConnectionScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The Pod is connected: the account, then Continue. */
export const Connected: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue" }));
    await expect(args.onContinue).toHaveBeenCalledWith(false);
  },
};

/** Connected, with the offer to skip the screen from now on, checked before Continue. */
export const OfferSkip: Story = {
  args: { offerSkip: true },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: "Don't show this screen after logging in" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(args.onContinue).toHaveBeenCalledWith(true);
  },
};

/** A profile without a name or a known identity provider: the WebID itself is shown. */
export const BareProfile: Story = {
  args: { account: { webId: account.webId, podUrl: account.podUrl } },
};

/** The Pod being discovered. */
export const Discovering: Story = { args: { busy: true } };

/** The profile names no storage: ways forward. */
export const NoPod: Story = {
  args: { account: { webId: account.webId, name: "Alice" } },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue anyway" }));
    await expect(args.onContinue).toHaveBeenCalledWith(false);
  },
};

/** The profile couldn't be read: try again or log out. */
export const Failed: Story = {
  args: { error: "The server did not answer in time. Check your connection and try again." },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
