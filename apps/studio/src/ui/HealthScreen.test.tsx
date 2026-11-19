// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { Card } from "@solid-memo/domain/deck";
import type { CardSpot, DeckHealth } from "@solid-memo/domain/deckHealth";
import {
  summarize,
  unreadableDocument,
  type DocumentReport,
  type Violation,
} from "@solid-memo/domain/validation";
import type { MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import {
  DeckHealthScreen,
  DUPLICATE_CARD_LIMIT,
  InstanceHealthScreen,
  placeText,
} from "./HealthScreen";
import { PROBLEM_LIMIT } from "./ProblemList";
import { screenCommands, WithCommands } from "../test/commands";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const other = makeDeck("deck-2", { en: "Verbs" });
const water: Card = {
  ...makeCard(deck, "water"),
  distractors: [{ id: "water-d1", text: { en: "fire" } }],
};
const fire = makeCard(deck, "fire");
const twin = makeCard(deck, "fire-2");

const missing: Violation = {
  path: SM.back,
  message: { en: "A card has a back." },
  severity: "violation",
  constraint: "MinCount",
};
const warned: Violation = {
  message: { en: "Odd." },
  severity: "warning",
  constraint: "Node",
  profile: "dcat-ap",
};
const info: Violation = { message: { en: "Note." }, severity: "info", constraint: "Node" };
const checked = (url: string, violations: Violation[]) => ({
  url,
  status: "checked" as const,
  shape: "card" as const,
  version: 5,
  violations,
});
const document = (url: string, subjects: DocumentReport["subjects"]): DocumentReport => ({
  url,
  status: "checked",
  subjects,
});

const report = summarize(instanceA.url, [
  document(deck.cardsDocumentUrl, [
    checked(water.url, [missing]),
    checked(`${deck.cardsDocumentUrl}#water-d1`, [warned, info]),
    { url: `${deck.cardsDocumentUrl}#stray`, status: "untyped" },
  ]),
  document(`${instanceA.url}catalog.ttl`, [
    checked(deck.url, [missing]),
    checked(`${instanceA.url}catalog.ttl#agent-ada`, [missing]),
    checked(`${deck.url}-cards`, [missing]),
  ]),
]);
const finding: MarkdownProblem = { code: "html", source: "<b>" };
const health: DeckHealth<MarkdownProblem> = {
  report,
  unstated: [{ card: fire, place: { tab: "content", part: "front" } }],
  duplicates: [[fire, twin]],
  markdown: [
    { card: water, place: { tab: "content", part: "backNote" }, language: "en", finding },
    {
      card: water,
      place: { tab: "distractors", distractor: "water-d1", part: "text" },
      language: "",
      finding,
    },
  ],
  markdownMore: 0,
};
const fine: DeckHealth<MarkdownProblem> = {
  report: summarize(instanceA.url, [document(deck.cardsDocumentUrl, [])]),
  unstated: [],
  duplicates: [],
  markdown: [],
  markdownMore: 0,
};

const spotHref = ({ card, place }: CardSpot) =>
  `#/card?card=${card.id}&tab=${place.tab}${"part" in place && place.part !== undefined ? `&part=${place.part}` : ""}${place.tab === "distractors" ? `&d=${place.distractor}` : ""}`;

function renderDeck(shown: DeckHealth<MarkdownProblem>, checking = false, held = false) {
  const onCheck = vi.fn();
  render(
    <WithCommands>
      <DeckHealthScreen
        deck={deck}
        health={shown}
        cards={[water, fire, twin]}
        checking={checking}
        onCheck={onCheck}
        spotHref={spotHref}
        aboutHref="#/about"
        held={held}
      />
    </WithCommands>,
  );
  return { onCheck };
}

const part = (name: string) => screen.getByRole("region", { name });

describe("placeText", () => {
  const t = (key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values)}`;
  it("names the card, and where in it", () => {
    const readerText = (text: Record<string, string>) => Object.values(text)[0]!;
    expect(
      placeText({ card: fire, place: { tab: "schedule" } }, t as never, readerText as never),
    ).toBe('studio.health.place.schedule {"card":"fire"}');
    expect(
      placeText(
        { card: fire, place: { tab: "distractors", distractor: "d" } },
        t as never,
        readerText as never,
      ),
    ).toBe('studio.health.place.distractor {"card":"fire","id":"d"}');
    expect(
      placeText(
        { card: fire, place: { tab: "distractors", distractor: "d", part: "note" } },
        t as never,
        readerText as never,
      ),
    ).toMatch(/distractorNote/);
  });
});

describe("DeckHealthScreen", () => {
  it("counts the deck's problems, and checks again, from the palette too", () => {
    const { onCheck } = renderDeck(health);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Health of Kanji N5");
    expect(screen.getByRole("status")).toHaveTextContent("8 problems found.");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    screenCommands().checkAgain!.run();
    expect(onCheck).toHaveBeenCalledTimes(2);
  });

  it("lists what the data check found, each linking where it is fixed, and offers no repair or removal", () => {
    renderDeck(health);
    const data = part("Data check");
    expect(data).toHaveTextContent(
      "4 violations in 2 documents. Solid Memo leaves this data as it is: it must be fixed outside the app, with another tool.",
    );
    const items = within(data).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("water, back: A card has a back.");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute(
      "href",
      "#/card?card=water&tab=content&part=back",
    );
    expect(items[1]).toHaveTextContent("water, wrong option water-d1: warning: DCAT-AP: Odd.");
    expect(items).not.toContainEqual(
      expect.objectContaining({ textContent: expect.stringContaining("Note.") }),
    );
    expect(within(items[2]!).getByRole("link", { name: "The deck's entry" })).toHaveAttribute(
      "href",
      "#/about",
    );
    expect(within(items[3]!).getByRole("link")).toHaveAttribute(
      "href",
      `${instanceA.url}catalog.ttl#agent-ada`,
    );
    expect(
      within(items[4]!).getByRole("link", { name: "The deck's distribution" }),
    ).toHaveAttribute("href", "#/about");
    expect(within(data).queryByRole("button")).toBeNull();
  });

  it("lists the sides to settle, the cards that say the same, and the Markdown that would not show as meant", () => {
    renderDeck(health);
    const languages = part("Languages");
    expect(languages).toHaveTextContent("1 card side states no language.");
    expect(
      within(languages).getByRole("link", { name: "Set the languages on the about screen" }),
    ).toHaveAttribute("href", "#/about");
    expect(within(languages).getByRole("link", { name: "fire, front" })).toHaveAttribute(
      "href",
      "#/card?card=fire&tab=content&part=front",
    );
    const duplicates = part("Cards that say the same");
    expect(within(duplicates).getByRole("listitem")).toHaveTextContent(
      "The same card 2 times: fire, fire-2",
    );
    const markdown = part("Markdown");
    const items = within(markdown).getAllByRole("listitem");
    expect(within(items[0]!).getByRole("link")).toHaveTextContent(
      "water, note under the back (English)",
    );
    expect(items[0]).toHaveTextContent("HTML such as <b> shows as typed.");
    expect(within(items[1]!).getByRole("link")).toHaveTextContent(/^water, wrong option water-d1$/);
    expect(within(items[1]!).getByRole("link")).toHaveAttribute(
      "href",
      "#/card?card=water&tab=distractors&part=text&d=water-d1",
    );
  });

  it("says when nothing is wrong, and when the release to weigh the languages against could not be read", () => {
    renderDeck({ ...fine, unstated: null }, true);
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(screenCommands()).toEqual({});
    expect(part("Languages")).toHaveTextContent("could not be read");
    expect(part("Cards that say the same")).toHaveTextContent("No two cards in use say the same.");
    expect(part("Markdown")).toHaveTextContent("shows as its author meant");
    expect(within(part("Data check")).queryByRole("list")).toBeNull();
    expect(part("Data check")).not.toHaveTextContent("leaves this data as it is");
  });

  it("names, but links to no form, the places of a deck held, saying why", () => {
    renderDeck(health, false, true);
    expect(
      screen.getByText(/Nothing in this deck can be changed until its data is fixed/),
    ).toBeInTheDocument();
    const data = part("Data check");
    const items = within(data).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("water, back: A card has a back.");
    expect(items[2]).toHaveTextContent("The deck's entry");
    // Only a subject the deck has no form for is still linked, to itself.
    expect(
      within(data)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([`${instanceA.url}catalog.ttl#agent-ada`]);
    for (const name of ["Languages", "Cards that say the same", "Markdown"])
      expect(within(part(name)).queryByRole("link")).toBeNull();
    expect(within(part("Markdown")).getAllByRole("listitem")[0]).toHaveTextContent(
      "water, note under the back (English)",
    );
  });

  it("lists a bounded number of each list of a deck's problems, saying how many more", () => {
    const many = Array.from({ length: PROBLEM_LIMIT + 70 }, (_, i) => i);
    const cards = Array.from({ length: DUPLICATE_CARD_LIMIT + 5 }, (_, i) =>
      makeCard(deck, `same-${i}`),
    );
    const finding: MarkdownProblem = { code: "html", source: "<i>" };
    const big: DeckHealth<MarkdownProblem> = {
      report: summarize(instanceA.url, [document(deck.cardsDocumentUrl, [])]),
      unstated: many.map(() => ({ card: fire, place: { tab: "content", part: "front" } })),
      duplicates: [cards, ...many.map((i) => [makeCard(deck, `a${i}`), makeCard(deck, `b${i}`)])],
      markdown: many.map(() => ({
        card: water,
        place: { tab: "content", part: "front" },
        language: "en",
        finding,
      })),
      markdownMore: 1000,
    };
    renderDeck(big);
    const more = "And 70 more problems, not listed here.";
    const languages = part("Languages");
    expect(languages).toHaveTextContent(`${many.length} card sides state no language.`);
    expect(within(languages).getAllByRole("listitem")).toHaveLength(PROBLEM_LIMIT);
    expect(within(languages).getByText(more)).toBeInTheDocument();
    const duplicates = part("Cards that say the same");
    const groups = within(duplicates).getAllByRole("listitem");
    expect(groups).toHaveLength(PROBLEM_LIMIT);
    expect(
      within(duplicates).getByText("And 71 more problems, not listed here."),
    ).toBeInTheDocument();
    expect(groups[0]).toHaveTextContent(`The same card ${cards.length} times:`);
    expect(groups[0]).toHaveTextContent(/, same-9 and 5 more cards$/);
    expect(within(groups[0]!).getAllByRole("link")).toHaveLength(DUPLICATE_CARD_LIMIT);
    const markdown = part("Markdown");
    expect(within(markdown).getAllByRole("listitem")).toHaveLength(PROBLEM_LIMIT);
    expect(
      within(markdown).getByText("And 1,070 more problems, not listed here."),
    ).toBeInTheDocument();
  });

  it("says so when nothing is wrong at all", () => {
    renderDeck(fine);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing is wrong with this deck.");
    expect(part("Languages")).toHaveTextContent("Every card side states its language.");
  });
});

describe("InstanceHealthScreen", () => {
  it("lists what the instance's check found, linking a deck's to its health, and every deck with its badge", () => {
    const instanceReport = summarize(instanceA.url, [
      document(deck.cardsDocumentUrl, [checked(water.url, [missing])]),
      document(`${instanceA.url}catalog.ttl`, [
        checked(other.url, [missing]),
        checked(`${instanceA.url}catalog.ttl#catalog`, [missing]),
        checked(`${other.url}-cards`, [missing]),
      ]),
    ]);
    const onCheck = vi.fn();
    render(
      <WithCommands>
        <InstanceHealthScreen
          instance={instanceA}
          report={instanceReport}
          decks={[deck, other]}
          checking={false}
          onCheck={onCheck}
          deckHref={(each) => `#/health?deck=${each.id}`}
          badge={(each) => <span>badge of {each.id}</span>}
        />
      </WithCommands>,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Health of Deck set A");
    const items = within(part("Data check")).getAllByRole("listitem");
    expect(within(items[0]!).getByRole("link", { name: "in Kanji N5" })).toHaveAttribute(
      "href",
      "#/health?deck=deck-1",
    );
    expect(within(items[1]!).getByRole("link", { name: "in Verbs" })).toHaveAttribute(
      "href",
      "#/health?deck=deck-2",
    );
    expect(within(items[2]!).getAllByRole("link")).toHaveLength(1);
    expect(within(items[3]!).getByRole("link", { name: "in Verbs" })).toHaveAttribute(
      "href",
      "#/health?deck=deck-2",
    );
    const decks = within(part("Decks")).getAllByRole("listitem");
    expect(decks[0]).toHaveTextContent("Kanji N5badge of deck-1");
    expect(within(decks[1]!).getByRole("link", { name: "Verbs" })).toHaveAttribute(
      "href",
      "#/health?deck=deck-2",
    );
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheck).toHaveBeenCalledTimes(1);
    // The palette's Check again does the same.
    expect(screenCommands().checkAgain!.label).toBe("Check again");
    screenCommands().checkAgain!.run();
    expect(onCheck).toHaveBeenCalledTimes(2);
  });

  it("links a subject found outside the catalog to the deck of the document it was found in", () => {
    // The other deck's entry, stated in this deck's cards document, is this deck's.
    const instanceReport = summarize(instanceA.url, [
      document(deck.cardsDocumentUrl, [checked(other.url, [missing])]),
    ]);
    render(
      <WithCommands>
        <InstanceHealthScreen
          instance={instanceA}
          report={instanceReport}
          decks={[deck, other]}
          checking={false}
          onCheck={vi.fn()}
          deckHref={(each) => `#/health?deck=${each.id}`}
          badge={() => null}
        />
      </WithCommands>,
    );
    const data = part("Data check");
    expect(within(data).queryByRole("link", { name: "in Verbs" })).toBeNull();
    const inDeck = within(data).getAllByRole("link", { name: "in Kanji N5" });
    expect(inDeck).toHaveLength(1);
    for (const link of inDeck) expect(link).toHaveAttribute("href", "#/health?deck=deck-1");
  });

  it("names each document the check could not read, and why, its hidden characters shown", () => {
    const unread = `${instanceA.url}reviews/deck-1.ttl`;
    render(
      <WithCommands>
        <InstanceHealthScreen
          instance={instanceA}
          report={summarize(instanceA.url, [unreadableDocument(unread, "403 Forbidden\u202e")])}
          decks={[deck]}
          checking={false}
          onCheck={vi.fn()}
          deckHref={(each) => `#/health?deck=${each.id}`}
          badge={() => null}
        />
      </WithCommands>,
    );
    const data = part("Data check");
    expect(data).toHaveTextContent("1 violation in 1 document.");
    const [item] = within(data).getAllByRole("listitem");
    expect(within(item!).getByRole("link")).toHaveAttribute("href", unread);
    expect(item).toHaveTextContent(
      "Solid Memo could not read this document, so it counts as invalid: 403 Forbidden⟨U+202E⟩",
    );
  });

  it("says while the instance is checked again, and offers no Check again in the palette then", () => {
    render(
      <WithCommands>
        <InstanceHealthScreen
          instance={instanceA}
          report={summarize(instanceA.url, [])}
          decks={[]}
          checking
          onCheck={vi.fn()}
          deckHref={() => "#"}
          badge={() => null}
        />
      </WithCommands>,
    );
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(screenCommands()).toEqual({});
  });
});

describe("DataCheckSection", () => {
  it("lists at most 50 of each of what a check found, saying how many more there are", () => {
    const many = <T,>(count: number, make: (index: number) => T) =>
      Array.from({ length: count }, (_, index) => make(index));
    const catalog = `${instanceA.url}catalog.ttl`;
    const subjects = many(51, (index) => `${catalog}#x${index}`);
    render(
      <WithCommands>
        <InstanceHealthScreen
          instance={instanceA}
          report={summarize(instanceA.url, [
            document(
              catalog,
              subjects.map((url) => checked(url, [missing])),
            ),
            ...many(52, (index) => unreadableDocument(`${instanceA.url}x${index}.ttl`, "500")),
          ])}
          decks={[]}
          checking={false}
          onCheck={vi.fn()}
          deckHref={() => "#"}
          badge={() => null}
        />
      </WithCommands>,
    );
    const data = part("Data check");
    expect(within(data).getAllByRole("listitem")).toHaveLength(100);
    expect(data).toHaveTextContent("And 1 more result, not listed here.");
    expect(data).toHaveTextContent("And 2 more documents, not listed here.");
  });
});
