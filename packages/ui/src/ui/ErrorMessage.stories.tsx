// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { ErrorMessage } from "./ErrorMessage";

const meta = {
  title: "Basics/ErrorMessage",
  component: ErrorMessage,
  args: { error: "The deck couldn't be saved: your pod didn't answer." },
} satisfies Meta<typeof ErrorMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An error, said in the screen's alert. */
export const WithError: Story = {};

/** A long error that wraps, with its technical detail folded out beneath it. */
export const WithDetail: Story = {
  args: {
    error: (
      <>
        The deck couldn't be saved: your pod refused the change, which usually means the document
        was changed elsewhere since this screen read it. Read it again and retry.
        <details>
          <summary>Technical details</summary>
          <code>412 Precondition Failed: PUT https://pod.example/memo/kanji.ttl</code>
        </details>
      </>
    ),
  },
};

/** No error: the alert is there, empty and hidden, ready for one. */
export const NoError: Story = { args: { error: null } };
