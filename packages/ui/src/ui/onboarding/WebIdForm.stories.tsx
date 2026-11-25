// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { WebIdForm } from "./WebIdForm";
import { DeviceValues } from "../deviceValues";
import { webIdKey } from "../remembered";
import { makeDeviceValuesFake } from "../../test/fakes/deviceValues";

/** A device that remembers a WebID from an earlier login. */
const rememberingDevice = makeDeviceValuesFake();
rememberingDevice.stored.set(webIdKey, "https://pod.example/alice/profile/card#me");

const meta = {
  title: "Onboarding/WebIdForm",
  component: WebIdForm,
  args: { busy: false, onSubmit: fn() },
} satisfies Meta<typeof WebIdForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An empty form, nothing remembered on this device. */
export const Empty: Story = {};

/** A typed WebID, normalized and handed on. */
export const LogIn: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("WebID"), "https://Pod.example/bob/profile/card#me");
    await userEvent.click(canvas.getByRole("button", { name: "Log in with Solid" }));
    await expect(args.onSubmit).toHaveBeenCalledWith("https://pod.example/bob/profile/card#me");
  },
};

/** A WebID that isn't one: the field says why and nothing is submitted. */
export const Invalid: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("WebID"), "http://pod.example/bob/profile/card#me");
    await userEvent.click(canvas.getByRole("button", { name: "Log in with Solid" }));
    await expect(await canvas.findByText(/A WebID must start with https:\/\//)).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** The WebID this device remembers, filled in with its box checked. */
export const Remembered: Story = {
  render: (args) => (
    <DeviceValues.Provider value={rememberingDevice}>
      <WebIdForm {...args} />
    </DeviceValues.Provider>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("WebID")).toHaveValue(
      "https://pod.example/alice/profile/card#me",
    );
  },
};

/** Redirecting to the identity provider: the form is disabled. */
export const Busy: Story = { args: { busy: true } };
