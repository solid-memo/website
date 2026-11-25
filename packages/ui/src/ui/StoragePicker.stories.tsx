// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { StoragePicker } from "./StoragePicker";

const meta = {
  title: "Instances/StoragePicker",
  component: StoragePicker,
  args: {
    storages: [
      { url: "https://pod.example/", source: "profile" },
      { url: "https://pod.example/work/", source: "linkHeader" },
      { url: "https://other-pod.example/alice/", source: "manual" },
    ],
    busy: false,
    error: null,
    onSelect: fn(),
    onAddManual: fn(),
  },
} satisfies Meta<typeof StoragePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Storages found each way, one chosen. */
export const Storages: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "https://pod.example/work/" }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith({
      url: "https://pod.example/work/",
      source: "linkHeader",
    });
  },
};

/** No storage found: one is entered by its address. */
export const NoneFound: Story = {
  args: { storages: [] },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox"), "https://pod.example/ ");
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onAddManual).toHaveBeenCalledWith("https://pod.example/");
  },
};

/** A storage being checked: nothing can be chosen. */
export const Busy: Story = { args: { busy: true } };

/** The entered storage couldn't be used. */
export const AddFailed: Story = {
  args: { error: "Solid Memo cannot reach that storage. Check its address." },
};
