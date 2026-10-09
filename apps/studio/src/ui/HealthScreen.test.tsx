import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { SM } from "@solid-memo/vocab/vocab.generated";
import type { Card } from "@solid-memo/domain/deck";
import type { CardSpot, DeckHealth } from "@solid-memo/domain/deckHealth";
import type { RepairPlan } from "@solid-memo/domain/repair";
import { summarize, type DocumentReport, type Violation } from "@solid-memo/domain/validation";
import type { MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import { DeckHealthScreen, InstanceHealthScreen, placeText, type RepairActions } from "./HealthScreen";
import { instanceA, makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const other = makeDeck("deck-2", { en: "Verbs" });
const water: Card = { ...makeCard(deck, "water"), distractors: [{ id: "water-d1", text: { en: "fire" } }] };
const fire = makeCard(deck, "fire");
const twin = makeCard(deck, "fire-2");

const missing: Violation = { path: SM.back, message: { en: "A card has a back." }, severity: "violation", constraint: "MinCount" };
const warned: Violation = { message: { en: "Odd." }, severity: "warning", constraint: "Node", profile: "dcat-ap" };
const info: Violation = { message: { en: "Note." }, severity: "info", constraint: "Node" };
const checked = (url: string, violations: Violation[]) => ({ url, status: "checked" as const, shape: "card" as const, version: 5, violations });
const document = (url: string, subjects: DocumentReport["subjects"]): DocumentReport => ({ url, status: "checked", subjects });

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
const plan: RepairPlan = {
  repairs: [{ kind: "describe-deck", documentUrl: `${instanceA.url}catalog.ttl`, subjectUrl: deck.url, version: 3 }],
  unrepairable: [{ documentUrl: deck.cardsDocumentUrl, subjectUrl: water.url, violations: [missing] }],
};
const finding: MarkdownProblem = { code: "html", source: "<b>" };
const health: DeckHealth<MarkdownProblem> = {
  report,
  unstated: [{ card: fire, place: { tab: "content", part: "front" } }],
  duplicates: [[fire, twin]],
  markdown: [
    { card: water, place: { tab: "content", part: "backNote" }, language: "en", finding },
    { card: water, place: { tab: "distractors", distractor: "water-d1", part: "text" }, language: "", finding },
  ],
};
const fine: DeckHealth<MarkdownProblem> = { report: summarize(instanceA.url, [document(deck.cardsDocumentUrl, [])]), unstated: [], duplicates: [], markdown: [] };

function actions(overrides: Partial<RepairActions> = {}): RepairActions {
  return { plan, busy: false, onRepair: vi.fn(), onRemove: vi.fn(), error: null, ...overrides };
}

const spotHref = ({ card, place }: CardSpot) =>
  `#/card?card=${card.id}&tab=${place.tab}${"part" in place && place.part !== undefined ? `&part=${place.part}` : ""}${place.tab === "distractors" ? `&d=${place.distractor}` : ""}`;

function renderDeck(shown: DeckHealth<MarkdownProblem>, repairs = actions(), checking = false, held = false) {
  const onCheck = vi.fn();
  render(
    <DeckHealthScreen
      deck={deck}
      health={shown}
      cards={[water, fire, twin]}
      checking={checking}
      onCheck={onCheck}
      repairs={repairs}
      spotHref={spotHref}
      aboutHref="#/about"
      held={held}
    />,
  );
  return { onCheck, repairs };
}

const part = (name: string) => screen.getByRole("region", { name });

describe("placeText", () => {
  const t = (key: string, values?: Record<string, unknown>) => `${key} ${JSON.stringify(values)}`;
  it("names the card, and where in it", () => {
    const readerText = (text: Record<string, string>) => Object.values(text)[0]!;
    expect(placeText({ card: fire, place: { tab: "schedule" } }, t as never, readerText as never)).toBe('studio.health.place.schedule {"card":"fire"}');
    expect(placeText({ card: fire, place: { tab: "distractors", distractor: "d" } }, t as never, readerText as never)).toBe(
      'studio.health.place.distractor {"card":"fire","id":"d"}',
    );
    expect(placeText({ card: fire, place: { tab: "distractors", distractor: "d", part: "note" } }, t as never, readerText as never)).toMatch(/distractorNote/);
  });
});

describe("DeckHealthScreen", () => {
  it("counts the deck's problems, and checks again", () => {
    const { onCheck } = renderDeck(health);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Health of Kanji N5");
    expect(screen.getByRole("status")).toHaveTextContent("8 problems found.");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheck).toHaveBeenCalled();
  });

  it("lists what the data check found, each linking where it is fixed, and its repairs", () => {
    const { repairs } = renderDeck(health);
    const data = part("Data check");
    expect(within(data).getByText("4 violations in 2 documents.")).toBeInTheDocument();
    const items = within(data).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("water, back: A card has a back.");
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "#/card?card=water&tab=content&part=back");
    expect(items[1]).toHaveTextContent("water, wrong option water-d1: warning: DCAT-AP: Odd.");
    expect(items).not.toContainEqual(expect.objectContaining({ textContent: expect.stringContaining("Note.") }));
    expect(within(items[2]!).getByRole("link", { name: "The deck's entry" })).toHaveAttribute("href", "#/about");
    expect(within(items[3]!).getByRole("link")).toHaveAttribute("href", `${instanceA.url}catalog.ttl#agent-ada`);
    expect(within(items[4]!).getByRole("link", { name: "The deck's distribution" })).toHaveAttribute("href", "#/about");
    expect(within(data).getByText("Solid Memo can repair these:")).toBeInTheDocument();
    fireEvent.click(within(data).getByRole("button", { name: "Repair 1 problem" }));
    expect(repairs.onRepair).toHaveBeenCalled();
    fireEvent.click(within(data).getByRole("button", { name: `Remove ${water.url}` }));
    expect(repairs.onRemove).toHaveBeenCalledWith(plan.unrepairable[0]);
  });

  it("says when a repair is made, or failed", () => {
    renderDeck(health, actions({ busy: true, error: "The pod refused." }));
    expect(screen.getByRole("button", { name: "Repairing…" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("The pod refused.");
  });

  it("lists the sides to settle, the cards that say the same, and the Markdown that would not show as meant", () => {
    renderDeck(health);
    const languages = part("Languages");
    expect(languages).toHaveTextContent("1 card side states no language.");
    expect(within(languages).getByRole("link", { name: "Set the languages on the about screen" })).toHaveAttribute("href", "#/about");
    expect(within(languages).getByRole("link", { name: "fire, front" })).toHaveAttribute("href", "#/card?card=fire&tab=content&part=front");
    const duplicates = part("Cards that say the same");
    expect(within(duplicates).getByRole("listitem")).toHaveTextContent("The same card 2 times: fire, fire-2");
    const markdown = part("Markdown");
    const items = within(markdown).getAllByRole("listitem");
    expect(within(items[0]!).getByRole("link")).toHaveTextContent("water, note under the back (English)");
    expect(items[0]).toHaveTextContent("HTML such as <b> shows as typed.");
    expect(within(items[1]!).getByRole("link")).toHaveTextContent(/^water, wrong option water-d1$/);
    expect(within(items[1]!).getByRole("link")).toHaveAttribute("href", "#/card?card=water&tab=distractors&part=text&d=water-d1");
  });

  it("says when nothing is wrong, and when the release to weigh the languages against could not be read", () => {
    renderDeck({ ...fine, unstated: null }, actions({ plan: { repairs: [], unrepairable: [] } }), true);
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
    expect(part("Languages")).toHaveTextContent("could not be read");
    expect(part("Cards that say the same")).toHaveTextContent("No two cards in use say the same.");
    expect(part("Markdown")).toHaveTextContent("shows as its author meant");
    expect(within(part("Data check")).queryByRole("list")).toBeNull();
  });

  it("names, but links to no form, the places of a deck held, saying why; its repairs and removals stay", () => {
    const { repairs } = renderDeck(health, actions(), false, true);
    expect(screen.getByText(/Nothing in this deck can be changed until the data is repaired/)).toBeInTheDocument();
    const data = part("Data check");
    const items = within(data).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("water, back: A card has a back.");
    expect(items[2]).toHaveTextContent("The deck's entry");
    // Only a subject the deck has no form for is still linked, to itself.
    expect(within(data).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([`${instanceA.url}catalog.ttl#agent-ada`]);
    fireEvent.click(within(data).getByRole("button", { name: "Repair 1 problem" }));
    expect(repairs.onRepair).toHaveBeenCalled();
    fireEvent.click(within(data).getByRole("button", { name: `Remove ${water.url}` }));
    expect(repairs.onRemove).toHaveBeenCalledWith(plan.unrepairable[0]);
    for (const name of ["Languages", "Cards that say the same", "Markdown"]) expect(within(part(name)).queryByRole("link")).toBeNull();
    expect(within(part("Markdown")).getAllByRole("listitem")[0]).toHaveTextContent("water, note under the back (English)");
  });

  it("says so when nothing is wrong at all", () => {
    renderDeck(fine, actions({ plan: { repairs: [], unrepairable: [] } }));
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
      <InstanceHealthScreen
        instance={instanceA}
        report={instanceReport}
        decks={[deck, other]}
        checking={false}
        onCheck={onCheck}
        repairs={actions({ plan: { repairs: [], unrepairable: [] } })}
        deckHref={(each) => `#/health?deck=${each.id}`}
        badge={(each) => <span>badge of {each.id}</span>}
      />,
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Health of Deck set A");
    const items = within(part("Data check")).getAllByRole("listitem");
    expect(within(items[0]!).getByRole("link", { name: "in Kanji N5" })).toHaveAttribute("href", "#/health?deck=deck-1");
    expect(within(items[1]!).getByRole("link", { name: "in Verbs" })).toHaveAttribute("href", "#/health?deck=deck-2");
    expect(within(items[2]!).getAllByRole("link")).toHaveLength(1);
    expect(within(items[3]!).getByRole("link", { name: "in Verbs" })).toHaveAttribute("href", "#/health?deck=deck-2");
    const decks = within(part("Decks")).getAllByRole("listitem");
    expect(decks[0]).toHaveTextContent("Kanji N5badge of deck-1");
    expect(within(decks[1]!).getByRole("link", { name: "Verbs" })).toHaveAttribute("href", "#/health?deck=deck-2");
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheck).toHaveBeenCalled();
  });

  it("says while the instance is checked again", () => {
    render(
      <InstanceHealthScreen
        instance={instanceA}
        report={summarize(instanceA.url, [])}
        decks={[]}
        checking
        onCheck={vi.fn()}
        repairs={actions({ plan: { repairs: [], unrepairable: [] } })}
        deckHref={() => "#"}
        badge={() => null}
      />,
    );
    expect(screen.getByRole("button", { name: "Checking…" })).toBeDisabled();
  });
});
