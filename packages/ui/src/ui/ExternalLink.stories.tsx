// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { ExternalLink } from "./ExternalLink";

const meta = {
  title: "Basics/ExternalLink",
  component: ExternalLink,
  args: { url: "https://pod.example/decks/kanji/", children: "The kanji deck's page" },
} satisfies Meta<typeof ExternalLink>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A web link with its own text: it opens in a new tab and says so. */
export const WebLink: Story = {};

/** A web link that reads its own address. */
export const Address: Story = { args: { children: undefined } };

/** An address with a look-alike host: it reads as the parser has it, punycode kept. */
export const LookAlikeHost: Story = {
  args: { url: "https://раураl.example/login", children: undefined },
};

/** A mailto: link: it opens the mail app, no tab. */
export const Mail: Story = {
  args: { url: "mailto:anton@example.com", children: "Write to the author" },
};

/** An address that isn't followed (not http(s) or mailto): plain text. */
export const NotFollowed: Story = {
  args: { url: "javascript:alert(1)", children: undefined },
};
