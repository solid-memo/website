// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/preact";
import type { Answer } from "@solid-memo/domain/answer";
import type { Deck } from "@solid-memo/domain/deck";
import { statisticsReportOf } from "../test/fakes/statistics";
import { ByDeckStatistics } from "./ByDeckStatistics";

const INSTANCE = "https://pod.example/solid-memo/a/";
const deck: Deck = {
  id: "deck-1",
  url: `${INSTANCE}catalog.ttl#deck-1`,
  title: { en: "Capitals" },
  cardsDocumentUrl: `${INSTANCE}decks/deck-1.ttl`,
  reviewsDocumentUrl: `${INSTANCE}reviews/deck-1.ttl`,
  createdAt: "",
  formatVersion: 4,
  direction: "front-to-back",
  authors: [],
};
const answer = (id: string, studyDay: string, extra: Partial<Answer> = {}): Answer => ({
  id,
  deckUrl: deck.url,
  cardUrl: `${INSTANCE}decks/deck-1.ttl#se`,
  direction: "front-to-back",
  grade: 4,
  answeredAt: `${studyDay}T10:00:00.000Z`,
  studyDay,
  nextIntervalDays: 6,
  ...extra,
});

/** Each deck's block: its heading, the line under it, and its figures as label and value. */
const blocks = () =>
  within(screen.getByRole("list", { name: "By deck" }))
    .getAllByRole("listitem")
    .map((block) => ({
      name: within(block).getByRole("heading").textContent,
      line: block.querySelector(".hint")?.textContent,
      figures: [...block.querySelectorAll("dl > div")].map((figure) =>
        [...figure.children].map((part) => part.textContent),
      ),
    }));

describe("ByDeckStatistics", () => {
  it("gives each deck's figures under their labels, a share's count under its percent", () => {
    const { decks } = statisticsReportOf(
      [
        answer("new", "2026-09-20"),
        answer("young", "2026-09-21", { priorIntervalDays: 1 }),
        answer("mature", "2026-09-21", {
          cardUrl: `${INSTANCE}decks/deck-1.ttl#no`,
          priorIntervalDays: 30,
          grade: 1,
        }),
      ],
      "2026-09-21",
    );
    render(<ByDeckStatistics decks={[deck]} statistics={decks} />);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("By deck");
    expect(blocks()).toEqual([
      {
        name: "Capitals",
        line: "3 answers · last studied September 21, 2026",
        figures: [
          ["Introduced", "1"],
          ["Young recall", "100% of 1 review"],
          ["Mature recall", "0% of 1 review"],
          ["First try", "100% remembered, of 1 new card"],
          ["Lapses", "1"],
        ],
      },
    ]);
  });

  it("gives recall each way only for a deck with reviews both ways, a direction a line", () => {
    const { decks } = statisticsReportOf(
      [
        answer("front", "2026-09-21", { priorIntervalDays: 1 }),
        answer("back", "2026-09-21", {
          direction: "back-to-front",
          priorIntervalDays: 1,
          grade: 1,
        }),
      ],
      "2026-09-21",
    );
    render(<ByDeckStatistics decks={[deck]} statistics={decks} />);
    expect(blocks()[0]?.figures.at(-1)).toEqual([
      "By direction",
      "Front → back: 100% of 1 review",
      "Back → front: 0% of 1 review",
    ]);
  });

  it("gives a course's graded answers, leaving out the shares of none, and names a removed deck", () => {
    const { decks } = statisticsReportOf(
      [
        answer("right", "2026-09-21", { mode: "multiple-choice", grade: 3 }),
        answer("wrong", "2026-09-21", {
          cardUrl: `${INSTANCE}decks/deck-1.ttl#no`,
          mode: "multiple-choice",
          grade: 1,
        }),
      ],
      "2026-09-21",
    );
    render(<ByDeckStatistics decks={[]} statistics={decks} />);
    expect(blocks()).toEqual([
      {
        name: "A removed deck",
        line: "2 answers · last studied September 21, 2026",
        figures: [
          ["Introduced", "2"],
          ["Lapses", "0"],
          ["Graded course answers", "50% right, of 2 answers"],
        ],
      },
    ]);
  });
});
