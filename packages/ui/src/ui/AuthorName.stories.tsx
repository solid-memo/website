// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { AuthorName, AuthorNames } from "./AuthorName";

const meta = {
  title: "Basics/AuthorName",
  component: AuthorName,
  args: { author: "Anton Wiklund <anton@example.com>" },
} satisfies Meta<typeof AuthorName>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A name with an address: a mailto link. */
export const WithAddress: Story = {};

/** A name alone: plain text. */
export const NameOnly: Story = { args: { author: "A friend of the deck" } };

/** An address with header fields: shown as plain text, never as a link that fills in a mail. */
export const HeaderFields: Story = {
  args: { author: "Support <help@example.org?cc=someone%40example.net&subject=Hello>" },
};

/** Several authors, comma-separated, and how many more a release names. */
export const SeveralAuthors: Story = {
  render: () => (
    <AuthorNames
      authors={["Anton Wiklund <anton@example.com>", "A friend", "김민준 <minjun@example.org>"]}
      count={12}
    />
  ),
};
