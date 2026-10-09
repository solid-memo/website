import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import type { Answer } from "@solid-memo/domain/answer";
import type { Card } from "@solid-memo/domain/deck";
import { CardHistoryScreen } from "./CardHistoryScreen";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const card: Card = { ...makeCard(deck, "water"), distractors: [{ id: "water-d1", text: { en: "fire" } }] };

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
          answer(3, { grade: 1, mode: "multiple-choice", chosenDistractor: `${deck.cardsDocumentUrl}#water-d1` }),
          answer(2, { grade: 0, mode: "multiple-choice", chosenDistractor: `${deck.cardsDocumentUrl}#water-d9` }),
          answer(1, { direction: "back-to-front" }),
        ]}
      />,
    );
    expect(screen.getByText("3 answers, 2 forgotten.")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "The card's answers, newest first" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(within(rows[0]!).getAllByRole("cell").map((cell) => cell.textContent).slice(1)).toEqual([
      "Front → back",
      "1 — Wrong",
      "Multiple choice",
      "fire",
    ]);
    expect(rows[0]).toHaveClass("forgotten");
    expect(rows[1]).toHaveTextContent("water-d9 (no longer on the card)");
    expect(within(rows[2]!).getAllByRole("cell").map((cell) => cell.textContent).slice(2)).toEqual(["4 — Good", "Recalled", ""]);
    expect(rows[2]).not.toHaveClass("forgotten");
  });

  it("says when the card has no answers in this deck", () => {
    render(<CardHistoryScreen card={makeCard(deck, "air")} answers={[]} />);
    expect(screen.getByText("No answers to this card in this deck yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
