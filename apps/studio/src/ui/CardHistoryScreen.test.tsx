// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import type { Answer } from "@solid-memo/domain/answer";
import type { Card } from "@solid-memo/domain/deck";
import type { ReviewQuality } from "@solid-memo/domain/review";
import { growth } from "@solid-memo/domain/testing/growth";
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

  it("lists a thousand answers at most, the newest, sorts those and says so, counting them all", () => {
    const answers = Array.from({ length: 1002 }, (_, n) =>
      // The oldest answer, past the limit, has the lowest grade of all.
      answer(1, { id: `row-${n}`, grade: n === 1001 ? 0 : 4 }),
    );
    render(<CardHistoryScreen card={card} answers={answers} />);
    expect(screen.getByText("1,002 answers. Lapses: 0.")).toBeInTheDocument();
    const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(1000);
    expect(
      screen.getByText("Only the newest 1,000 of 1,002 answers are listed."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Grade" }));
    expect(rows()).toHaveLength(1000);
    expect(rows().filter((row) => row.classList.contains("forgotten"))).toEqual([]);
  });

  it("lists every answer up to the limit, saying nothing of one", () => {
    const answers = Array.from({ length: 1000 }, (_, n) => answer(1, { id: `row-${n}` }));
    render(<CardHistoryScreen card={card} answers={answers} />);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1001);
    expect(screen.queryByText(/answers are listed/)).not.toBeInTheDocument();
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

  it("names each answer's chosen option among many with long ids alike, the first of an id kept", () => {
    const prefix = "d".repeat(2_000);
    const many: Card = {
      ...card,
      distractors: [
        ...Array.from({ length: 50 }, (_, n) => ({
          id: `${prefix}${String(n).padStart(3, "0")}`,
          text: { en: `option ${n}` },
        })),
        { id: `${prefix}007`, text: { en: "a second option 7" } },
      ],
    };
    const picks = [49, 7, 0, 23];
    render(
      <CardHistoryScreen
        card={many}
        answers={picks.map((pick, n) =>
          answer(9 - n, {
            grade: 1,
            mode: "multiple-choice",
            chosenDistractor: `${deck.cardsDocumentUrl}#${prefix}${String(pick).padStart(3, "0")}`,
          }),
        )}
      />,
    );
    const table = screen.getByRole("table", { name: "The card's answers, newest first" });
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("cell").at(-1)!.textContent),
    ).toEqual(picks.map((pick) => `option ${pick}`));
  });

  it("grows with the answers and the card's options, not with their product", () => {
    // Ids near the longest a pod term may be, so that a search among the
    // options, reading each id, stands out of the rendering by far.
    const prefix = "d".repeat(16_000);
    const ratio = growth(
      (size) => {
        // More options than answers, as only the answers are rows of the table.
        const ids = Array.from(
          { length: size * 8 },
          (_, n) => `${prefix}${String(n).padStart(6, "0")}`,
        );
        const large: Card = {
          ...card,
          distractors: ids.map((id) => ({ id, text: { en: "fire" } })),
        };
        // Each answer names the last option: a search among them all reads every id.
        const answers = Array.from({ length: size }, (_, n) =>
          answer(1, {
            id: `answer-${n}`,
            grade: 1,
            mode: "multiple-choice",
            chosenDistractor: `${deck.cardsDocumentUrl}#${ids.at(-1)}`,
          }),
        );
        return () => {
          render(<CardHistoryScreen card={large} answers={answers} />);
          cleanup();
        };
      },
      50,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("says when the card has no answers in this deck", () => {
    render(<CardHistoryScreen card={makeCard(deck, "air")} answers={[]} />);
    expect(screen.getByText("No answers to this card in this deck yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
