// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { AppError } from "@solid-memo/domain/appError";
import { WebIdDocumentContainer } from "./WebIdDocumentContainer";
import { makeUseCasesFake } from "../test/useCasesFake";
import { storyWebId, storyWebIdDocument } from "../test/stories/webId";

const meta = {
  title: "App/WebIdDocumentContainer",
  component: WebIdDocumentContainer,
  args: {
    useCases: makeUseCasesFake({ viewWebIdDocument: fn(async () => storyWebIdDocument) }),
    session: { webId: storyWebId },
  },
  parameters: { controls: { exclude: ["useCases", "session"] } },
} satisfies Meta<typeof WebIdDocumentContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The learner's WebID document, opened from its summary. */
export const Document: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("WebID document"));
    await expect(
      await canvas.findByText('"Alice" (http://www.w3.org/2001/XMLSchema#string)'),
    ).toBeVisible();
  },
};

/** The document on its way. */
export const Loading: Story = {
  args: {
    useCases: makeUseCasesFake({ viewWebIdDocument: fn(() => new Promise<never>(() => {})) }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("WebID document"));
    await expect(await canvas.findByText("Loading profile…")).toBeVisible();
  },
};

/** The document couldn't be read. */
export const ReadFailed: Story = {
  args: {
    useCases: makeUseCasesFake({
      viewWebIdDocument: fn(async () => {
        throw new AppError("webIdNoSubject");
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("WebID document"));
    await expect(
      await canvas.findByText(/Your WebID profile does not describe you/),
    ).toBeInTheDocument();
  },
};
