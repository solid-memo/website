// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, within } from "storybook/test";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { CardFace, CardRowBack, CardRowFront } from "./CardFace";
import { pictureUrl } from "../test/stories/cards";

const meta = {
  title: "Cards/CardFace",
  component: CardFace,
  args: { side: "front", text: { "": "水" } },
} satisfies Meta<typeof CardFace>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A front of plain text alone: a question, large. */
export const PlainText: Story = {};

/** The back as study reveals it: the answer, with its label and note. */
export const AnswerWithLabelAndNote: Story = {
  args: {
    side: "back",
    role: "answer",
    text: { en: "water" },
    label: { en: "Meaning" },
    note: { en: "Also used in 水曜日, Wednesday." },
  },
};

/** A card written in Markdown: code, emphasis, a list and a note. */
export const Markdown: Story = {
  args: {
    side: "back",
    text: {
      en: "It **replaces** the last commit with a new one:\n\n- its message\n- its changes\n\n```\ngit commit --amend\n```",
    },
    label: { en: "What `--amend` does" },
    note: { en: "Never amend a commit *already pushed*." },
    textFormat: SM.markdown,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("replaces").tagName).toBe("STRONG");
  },
};

/**
 * A picture given as a data: URL, with its description: the face loads
 * only http(s) pictures, so it names the URL rather than show it.
 */
export const PictureFromDataUrl: Story = {
  args: {
    text: { en: "Which flag?" },
    imageUrl: pictureUrl,
    imageDescription: { en: "Solid Memo's illustration of cards" },
  },
};

/** Arabic text, read right to left, with a note in Arabic too. */
export const RightToLeftArabic: Story = {
  args: {
    text: { ar: "أهلاً وسهلاً بك في بيتنا، تفضل بالدخول" },
    note: { ar: "تقال للضيف عند الباب" },
  },
  globals: { direction: "rtl" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[dir="rtl"]')).not.toBeNull();
  },
};

/** A word too long for any line, then a sentence that wraps: the question's text shrinks as it grows. */
export const VeryLongText: Story = {
  args: {
    text: {
      de: "Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz: the law on delegating the monitoring of beef labeling, repealed in 2013 along with its 63-letter name.",
    },
  },
};

/** The front and back of a card as a Browser row shows them: a picture-only front named by its description. */
export const BrowserRow: Story = {
  render: () => (
    <table class="card-table">
      <tbody>
        <tr>
          <td>
            <CardRowFront
              front={{}}
              back={{ en: "Flashcards" }}
              imageUrl={pictureUrl}
              imageDescription={{ en: "Solid Memo's illustration of cards" }}
            />
          </td>
          <td>
            <CardRowBack back={{ en: "The rising **sun**" }} textFormat={SM.markdown} />
          </td>
        </tr>
      </tbody>
    </table>
  ),
};
