// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ErrorMessage } from "./ErrorMessage";
import { LanguagePicker } from "./LanguagePicker";

const meta = {
  title: "Cards/LanguagePicker",
  component: LanguagePicker,
  args: {
    id: "story-language",
    value: "sv",
    role: "back",
    suggestions: ["sv", "ko"],
    onChange: fn(),
  },
  parameters: { controls: { exclude: ["field"] } },
} satisfies Meta<typeof LanguagePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A language chosen: the button says it. */
export const Chosen: Story = {};

/** Opened: the deck's languages, recent ones and any other by its code; choosing one says so. */
export const Open: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Language: Swedish" }));
    await userEvent.click(await canvas.findByRole("radio", { name: /Korean/ }));
    await expect(args.onChange).toHaveBeenCalledWith("ko");
  },
};

/** No language chosen yet. */
export const NotStated: Story = { args: { value: null } };

/** Text saved with no language: a hint asks for one. */
export const SavedWithNone: Story = { args: { value: null, unstated: true } };

/** A language still to choose, asked for by the form's message: the button is marked invalid. */
export const Invalid: Story = {
  args: { value: null, errorId: "story-language-error" },
  render: (args) => (
    <>
      <LanguagePicker {...args} />
      <ErrorMessage id="story-language-error" error="Choose the language of the back." />
    </>
  ),
};

/** While the form saves: nothing can be chosen. */
export const Disabled: Story = { args: { disabled: true } };

/** Joined with the text box whose language it is, the button at its end. */
export const WithField: Story = {
  args: { field: <input type="text" value="vatten" lang="sv" aria-label="Back" /> },
};

/** Joined with a textarea in Arabic, right to left. */
export const WithArabicTextarea: Story = {
  args: {
    value: "ar",
    field: <textarea lang="ar" aria-label="Back" value="أهلاً وسهلاً بك في بيتنا" />,
  },
  globals: { direction: "rtl" },
};
