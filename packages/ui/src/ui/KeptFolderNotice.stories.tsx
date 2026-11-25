// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { KeptFolderNotice } from "./KeptFolderNotice";

const meta = {
  title: "Instances/KeptFolderNotice",
  component: KeptFolderNotice,
  args: { url: "https://pod.example/solid-memo/study/" },
} satisfies Meta<typeof KeptFolderNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The folder was kept because another app's files are in it. */
export const OtherFiles: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole("status")).toBeInTheDocument();
  },
};

/** The folder was kept because it holds releases others may read. */
export const Releases: Story = { args: { releases: true } };

/** The folder was kept, and so were documents that also hold another app's data. */
export const FolderAndDocuments: Story = { args: { documents: 3 } };

/** Only a document was kept, for another app's data in it. */
export const OneDocument: Story = { args: { url: null, documents: 1 } };

/** Nothing was kept: no notice. */
export const NothingKept: Story = { args: { url: null } };
