// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { InstanceCreator } from "./InstanceCreator";
import { REGISTRATION_OPTIONS } from "../test/fakes/instances";

const meta = {
  title: "Instances/InstanceCreator",
  component: InstanceCreator,
  args: {
    storage: { url: "https://pod.example/", source: "profile" },
    options: REGISTRATION_OPTIONS,
    busy: false,
    error: null,
    onCreate: fn(),
    backHref: "#/instances",
  },
} satisfies Meta<typeof InstanceCreator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A new instance named and created in the pod's suggested folder, registered privately. */
export const Create: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText(/name/i), "  Languages ");
    await userEvent.click(canvas.getByRole("button", { name: /create/i }));
    await expect(args.onCreate).toHaveBeenCalledWith({
      containerUrl: "https://pod.example/solid-memo/main/",
      name: "Languages",
      registrationTarget: "private",
    });
  },
};

/** The type indexes are still being read: the two kinds are offered. */
export const OptionsLoading: Story = { args: { options: null } };

/** The instance being created: the form can't be changed. */
export const Busy: Story = { args: { busy: true } };

/** Creating the instance failed. */
export const CreateFailed: Story = {
  args: { error: "Solid Memo could not write to your pod. Check that you may write there." },
};
