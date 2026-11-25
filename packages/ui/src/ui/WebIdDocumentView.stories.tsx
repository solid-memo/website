// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { WebIdDocumentView } from "./WebIdDocumentView";
import { storyWebId, storyWebIdDocument } from "../test/stories/webId";

const meta = {
  title: "App/WebIdDocumentView",
  component: WebIdDocumentView,
  args: { document: storyWebIdDocument },
  parameters: { controls: { exclude: ["document"] } },
} satisfies Meta<typeof WebIdDocumentView>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A WebID document: each subject a table of its predicates and values. */
export const Document: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText('"Alice" (http://www.w3.org/2001/XMLSchema#string)'),
    ).toBeInTheDocument();
    await expect(canvas.getByText('"Lär sig japanska, en kanji om dagen"@sv')).toBeInTheDocument();
  },
};

/** A document with no subjects: nothing to show. */
export const Empty: Story = {
  args: { document: { url: "https://pod.example/alice/profile/card", subjects: [] } },
};

/** A javascript: IRI from the pod is shown as text, never as a link. */
export const UnsafeIri: Story = {
  args: {
    document: {
      url: "https://pod.example/alice/profile/card",
      subjects: [
        {
          url: storyWebId,
          properties: [
            {
              predicate: "http://xmlns.com/foaf/0.1/homepage",
              values: [{ type: "iri", value: "javascript:alert(1)" }],
            },
          ],
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("javascript:alert(1)").closest("a")).toBeNull();
  },
};
