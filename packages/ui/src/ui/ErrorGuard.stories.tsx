// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";
import type { Locale } from "@solid-memo/domain/locale";
import { ErrorGuard } from "./ErrorGuard";

/** A screen that throws as it renders. */
function Broken(): never {
  throw new Error("render failed");
}

const meta = {
  title: "Basics/ErrorGuard",
  component: ErrorGuard,
  args: {
    source: { repoUrl: "https://github.com/solid-memo/website", version: "8.0.0", commitSha: null },
    appName: "Solid Memo",
    locale: fn((): Locale => "en"),
    // The app it guards is each story's own (render), not a control.
    children: null,
  },
  parameters: { controls: { exclude: ["locale", "children"] } },
} satisfies Meta<typeof ErrorGuard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** An app that works: shown as it is. */
export const Working: Story = {
  render: (args) => (
    <ErrorGuard {...args}>
      <p>The app, as usual.</p>
    </ErrorGuard>
  ),
};

/** The app failed outside any screen's own boundary: “Something went wrong” takes the whole page. */
export const PageFailed: Story = {
  beforeEach: () => {
    const quiet = spyOn(console, "error").mockImplementation(() => undefined);
    return () => quiet.mockRestore();
  },
  render: (args) => (
    <ErrorGuard {...args}>
      <Broken />
    </ErrorGuard>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeInTheDocument();
  },
};

/** An error nothing caught (a click's handler threw): a notice the learner can close. */
export const UncaughtError: Story = {
  render: (args) => (
    <ErrorGuard {...args}>
      <p>The app, still working around the notice.</p>
    </ErrorGuard>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const error = new Error("click failed");
    // Said again until the notice shows: the guard starts listening once it has mounted.
    await waitFor(() => {
      window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));
      expect(canvas.getByRole("alert")).toHaveTextContent("Something went wrong.");
    });
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};
