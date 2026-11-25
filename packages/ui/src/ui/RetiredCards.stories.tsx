// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Meta, StoryObj } from "@storybook/preact-vite";
import { expect, userEvent, within } from "storybook/test";
import type { Card } from "@solid-memo/domain/deck";
import { RetiredNotice, RetiredTag, useRetiredCards } from "./RetiredCards";
import { kanjiCards } from "../test/storyData";
import { retiredCard } from "../test/stories/cards";

const meta = {
  title: "Cards/RetiredCards",
  component: RetiredNotice,
} satisfies Meta<typeof RetiredNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On a retired card's page: why it is not studied. */
export const Notice: Story = {};

/** The mark on a retired card's row. */
export const Tag: Story = {
  render: () => <RetiredTag />,
};

/** A list as a browser shows it, the retired card listed once the checkbox asks for it. */
function CardList({ cards }: { cards: Card[] }) {
  const { listed, toggle } = useRetiredCards(cards);
  return (
    <>
      {toggle}
      <ul>
        {listed.map((card) => (
          <li key={card.id}>
            {card.back.en} {card.retired && <RetiredTag />}
          </li>
        ))}
      </ul>
    </>
  );
}

/** A list with a retired card: hidden until the user asks to see it. */
export const ShowRetiredToggle: Story = {
  render: () => <CardList cards={[...kanjiCards, retiredCard]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText("mountain")).toBeNull();
    await userEvent.click(canvas.getByRole("checkbox", { name: "Show retired cards" }));
    await expect(await canvas.findByText(/mountain/)).toBeInTheDocument();
  },
};

/** A list with no retired card: no checkbox. */
export const NoneRetired: Story = {
  render: () => <CardList cards={kanjiCards} />,
};
