// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { DataLink, LicenseLink } from "./DataLink";

const meta = {
  title: "Basics/DataLink",
  component: DataLink,
  args: { url: "https://pod.example/decks/kanji/sources", label: "Where the kanji come from" },
} satisfies Meta<typeof DataLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A source with a label: the host it leads to beside it. */
export const Labeled: Story = {};

/** A source with no label: its address, which names its host itself. */
export const AddressOnly: Story = { args: { label: undefined } };

/** An address that is not followed (a user name before the host): plain text. */
export const NotFollowed: Story = {
  args: { url: "https://someone@pod.example/decks/kanji/sources", label: undefined },
};

/** A well-known license by its short name, and an unknown one by its address. */
export const Licenses: Story = {
  render: () => (
    <ul>
      <li>
        <LicenseLink url="https://creativecommons.org/licenses/by/4.0/" />
      </li>
      <li>
        <LicenseLink url="https://pod.example/licenses/our-own" />
      </li>
    </ul>
  ),
};
