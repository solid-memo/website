// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, spyOn, userEvent, within } from "storybook/test";
import { ErrorBoundary, ErrorReport, SomethingWentWrong } from "./ErrorBoundary";
import type { SiteSource } from "./Footer";

/** The build the stories name, as the footer does. */
const source: SiteSource = {
  repoUrl: "https://github.com/solid-memo/website",
  version: "8.0.0",
  commitSha: "4f949fd8a1b2c3d4e5f60718293a4b5c6d7e8f90",
};

/** What a screen threw, an address in it, which the details leave out. */
const thrown = new TypeError(
  "Cannot read https://pod.example/memo/kanji.ttl for https://pod.example/profile/card#me",
);

/** Try again, on the crash screen shown alone. */
const onTryAgain = fn();

/** A screen that throws as it renders. */
function Broken(): never {
  throw thrown;
}

const meta = {
  title: "Basics/ErrorBoundary",
  component: ErrorBoundary,
  args: {
    fallback: (error, reset) => (
      <SomethingWentWrong error={error} source={source} onTryAgain={reset} />
    ),
    // The screen it guards is each story's own (render), not a control.
    children: null,
  },
  parameters: { controls: { exclude: ["fallback", "children"] } },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Children that work: shown as they are. */
export const Working: Story = {
  render: (args) => (
    <ErrorBoundary {...args}>
      <p>The deck list, as usual.</p>
    </ErrorBoundary>
  ),
};

/** A screen that threw as it rendered: “Something went wrong” in its place (what it caught is logged to the console). */
export const Failed: Story = {
  beforeEach: () => {
    const quiet = spyOn(console, "error").mockImplementation(() => undefined);
    return () => quiet.mockRestore();
  },
  render: (args) => (
    <ErrorBoundary {...args}>
      <Broken />
    </ErrorBoundary>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { name: "Something went wrong" }),
    ).toBeInTheDocument();
  },
};

/** The crash screen on its own, as a page's own heading; Try again renders the screen afresh. */
export const CrashScreen: Story = {
  render: () => (
    <SomethingWentWrong error={thrown} source={source} onTryAgain={onTryAgain} heading="h1" />
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Try again" }));
    await expect(onTryAgain).toHaveBeenCalled();
  },
};

/** The way to report an error, with its details folded away, for a build of unknown commit. */
export const Report: Story = {
  render: () => <ErrorReport error={thrown} source={{ ...source, commitSha: null }} />,
};
