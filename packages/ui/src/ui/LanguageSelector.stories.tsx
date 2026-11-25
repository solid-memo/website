// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { I18nProvider } from "./i18n";
import { LanguageSelector } from "./LanguageSelector";

const meta = {
  title: "Basics/LanguageSelector",
  component: LanguageSelector,
} satisfies Meta<typeof LanguageSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The languages behind a globe, the toolbar's one chosen. */
export const Default: Story = {};

/** A language whose messages could not be fetched (offline): said, and the screen stays in English. */
export const Unavailable: Story = {
  render: () => (
    <I18nProvider
      locale="en"
      onChoose={fn(async () => {
        throw new Error("offline");
      })}
    >
      <LanguageSelector />
    </I18nProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "Language" }), "de");
    await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("Deutsch"));
  },
};
