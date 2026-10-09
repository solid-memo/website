import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { CardInspectorScreen } from "./CardInspectorScreen";
import type { CardTab } from "./router";
import { makeCard, makeDeck } from "../test/fixtures";

const deck = makeDeck("deck-1", { en: "Kanji N5" });
const card = { ...makeCard(deck, "water"), distractors: [{ id: "water-d1", text: { en: "fire" } }] };

function renderScreen(overrides: Partial<Parameters<typeof CardInspectorScreen>[0]> = {}) {
  const props = {
    card,
    release: "none" as const,
    tab: "content" as CardTab,
    tabHref: (tab: CardTab) => `#/card?tab=${tab}`,
    onTab: vi.fn(),
    appHref: "../#/card",
    ...overrides,
  };
  render(
    <CardInspectorScreen {...props}>
      <p>The panel</p>
    </CardInspectorScreen>,
  );
  return props;
}

describe("CardInspectorScreen", () => {
  it("heads the card by its name, with its tabs, the one shown current, and its panel", () => {
    const props = renderScreen({ tab: "distractors" });
    expect(screen.getByRole("heading", { name: "Card: water" })).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "What to edit" });
    expect(tabs).toHaveTextContent("ContentWrong options (1)");
    expect(screen.getByRole("link", { name: "Wrong options (1)" })).toHaveAttribute("aria-current", "page");
    const content = screen.getByRole("link", { name: "Content" });
    expect(content).toHaveAttribute("href", "#/card?tab=content");
    expect(content).not.toHaveAttribute("aria-current");
    fireEvent.click(content);
    expect(props.onTab).toHaveBeenCalledWith("content");
    expect(screen.getByText("The panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open this card in Solid Memo" })).toHaveAttribute("href", "../#/card");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("counts no wrong options for a card without, and marks a retired card", () => {
    renderScreen({ card: { ...makeCard(deck, "air", true) } });
    expect(screen.getByRole("link", { name: "Wrong options (0)" })).toBeInTheDocument();
    expect(screen.getByText("Retired")).toHaveClass("studio-badge");
  });

  it("warns that an edit detaches a card still as its release has it", () => {
    renderScreen({ release: "same" });
    expect(screen.getByRole("note")).toHaveTextContent("An edit detaches it");
    expect(screen.getByRole("note")).toHaveClass("warning");
  });

  it("says a card changed from its release is no longer updated by it", () => {
    renderScreen({ release: "changed" });
    expect(screen.getByRole("note")).toHaveTextContent("newer releases no longer update it");
  });
});
