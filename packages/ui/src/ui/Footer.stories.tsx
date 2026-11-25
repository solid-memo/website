// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { Footer } from "./Footer";

const meta = {
  title: "Basics/Footer",
  component: Footer,
  args: {
    source: {
      repoUrl: "https://github.com/solid-memo/website",
      version: "8.0.0",
      commitSha: "4f949fd8a1b2c3d4e5f60718293a4b5c6d7e8f90",
    },
  },
} satisfies Meta<typeof Footer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The footer of a build that knows its commit: the version links to it. */
export const AtCommit: Story = {};

/** A build of unknown commit: the version alone. */
export const UnknownCommit: Story = {
  args: {
    source: { repoUrl: "https://github.com/solid-memo/website", version: "8.0.0", commitSha: null },
  },
};
