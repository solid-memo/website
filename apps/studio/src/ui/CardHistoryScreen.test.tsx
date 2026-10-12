// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { Answer } from "@solid-memo/domain/answer";
import type { Card } from "@solid-memo/domain/deck";
import type { ReviewQuality } from "@solid-memo/domain/review";
import { CardHistoryScreen } from "./CardHistoryScreen";
import { makeCard, makeDeck } from "../test/fixtures";
import { WithKeys } from "../test/keys";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const card: Card = {
  ...makeCard(deck, "water"),
  distractors: [{ id: "water-d1", text: { en: "fire" } }],
};

function answer(n: number, extra: Partial<Answer> = {}): Answer {
  return {
    id: `answer-${n}`,
    deckUrl: deck.url,
    cardUrl: card.url,
    direction: "front-to-back",
    grade: 4,
    answeredAt: `2026-10-0${n}T10:00:00.000Z`,
    studyDay: `2026-10-0${n}`,
    nextIntervalDays: 1,
    ...extra,
  };
}

describe("CardHistoryScreen", () => {
  it("lists each answer: when, which way, its grade, how, and the wrong option chosen", () => {
    render(
      <CardHistoryScreen
        card={card}
        answers={[
          answer(3, {
            grade: 1,
            mode: "multiple-choice",
            chosenDistractor: `${deck.cardsDocumentUrl}#water-d1`,
          }),
          answer(2, {
            grade: 0,
            mode: "multiple-choice",
            chosenDistractor: `${deck.cardsDocumentUrl}#water-d9`,
          }),
          answer(1, { direction: "back-to-front" }),
        ]}
      />,
    );
    expect(screen.getByText("3 answers. Lapses: 0.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "The card's answers, newest first" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByRole("rowheader")).toHaveTextContent("October 3, 2026");
    expect(
      within(rows[0]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Front → back", "1 — Wrong", "Multiple choice", "fire"]);
    expect(rows[0]).toHaveClass("forgotten");
    expect(rows[1]).toHaveTextContent("water-d9 (no longer on the card)");
    expect(
      within(rows[2]!)
        .getAllByRole("cell")
        .map((cell) => cell.textContent)
        .slice(1),
    ).toEqual(["4 — Good", "Recalled", ""]);
    expect(rows[2]).not.toHaveClass("forgotten");
  });

  it("counts the card's lapses as the cards' table does, though every answer below grade 3 is marked forgotten", () => {
    const at = (n: number, time: string, grade: ReviewQuality, priorIntervalDays?: number) =>
      answer(n, {
        grade,
        answeredAt: `2026-10-0${n < 4 ? 1 : 5}T${time}:00.000Z`,
        studyDay: n < 4 ? "2026-10-01" : "2026-10-05",
        ...(priorIntervalDays === undefined ? {} : { priorIntervalDays }),
      });
    render(
      <CardHistoryScreen
        card={card}
        answers={[
          // A review forgotten (a lapse) and its repeat the same day.
          at(5, "10:05", 4, 1),
          at(4, "10:00", 1, 4),
          // Introduced, failed twice the same day: no lapse.
          at(3, "10:10", 4, 1),
          at(2, "10:05", 1, 1),
          at(1, "10:00", 0),
        ]}
      />,
    );
    expect(screen.getByText("5 answers. Lapses: 1.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "The card's answers, newest first" });
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .filter((row) => row.classList.contains("forgotten")),
    ).toHaveLength(3);
  });

  it("sorts the answers by a column's header, but the wrong option's, then the other way, then newest first", () => {
    render(
      <WithKeys>
        <CardHistoryScreen
          card={card}
          answers={[
            answer(3, { grade: 1, mode: "multiple-choice" }),
            answer(2, { grade: 5, direction: "back-to-front" }),
            answer(1, { grade: 3 }),
          ]}
        />
      </WithKeys>,
    );
    const table = within(screen.getByRole("table", { name: "The card's answers, newest first" }));
    const days = () =>
      table
        .getAllByRole("rowheader")
        .map((cell) => Number(/October (\d+)/.exec(cell.textContent!)![1]));
    expect(table.queryByRole("button", { name: "Wrong option chosen" })).toBeNull();
    fireEvent.click(table.getByRole("button", { name: "When" }));
    expect(days()).toEqual([1, 2, 3]);
    fireEvent.click(table.getByRole("button", { name: "Grade" }));
    expect(days()).toEqual([3, 1, 2]);
    fireEvent.click(table.getByRole("button", { name: "Direction" }));
    expect(days()).toEqual([2, 3, 1]);
    fireEvent.click(table.getByRole("button", { name: "How" }));
    expect(days()).toEqual([3, 2, 1]);
    // The table beside the deck's cards leaves j and k to theirs.
    document.body.focus();
    expect(fireEvent.keyDown(document.body, { key: "j" })).toBe(true);
  });

  it("says when the card has no answers in this deck", () => {
    render(<CardHistoryScreen card={makeCard(deck, "air")} answers={[]} />);
    expect(screen.getByText("No answers to this card in this deck yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
