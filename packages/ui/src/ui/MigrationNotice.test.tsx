// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describeFormats, describeOutdated, MigrationNotice } from "./MigrationNotice";
import { createI18n, I18nProvider } from "./i18n";
import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION, type Deck } from "@solid-memo/domain/deck";
import type { MigrationPlan } from "@solid-memo/domain/migration";
import { PREFERENCES_FORMAT_VERSION } from "@solid-memo/domain/preferences";
import { REVIEW_STATE_FORMAT_VERSION } from "@solid-memo/domain/review";

const deck: Deck = {
  id: "deck-1",
  url: "https://pod.example/solid-memo/a/catalog.ttl#deck-1",
  title: { en: "Kanji N5" },
  cardsDocumentUrl: "https://pod.example/solid-memo/a/decks/deck-1.ttl",
  reviewsDocumentUrl: "https://pod.example/solid-memo/a/reviews/deck-1.ttl",
  direction: "front-to-back",
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
  authors: [],
};
const capitals: Deck = { ...deck, id: "deck-2", url: `${deck.url}2`, title: { en: "Capitals" } };
const verbs: Deck = { ...deck, id: "deck-3", url: `${deck.url}3`, title: { en: "Verbs" } };

const { t } = createI18n("en");

/** Nothing of any kind outdated: each at the format this app writes. */
const latest = {
  deck: DECK_FORMAT_VERSION,
  card: CARD_FORMAT_VERSION,
  reviewState: REVIEW_STATE_FORMAT_VERSION,
  preferences: PREFERENCES_FORMAT_VERSION,
};

const nothing = {
  preferencesOutdated: false,
  instanceOutdated: false,
  catalogMissing: false,
  oldestFormat: latest,
};

const plan: MigrationPlan = {
  decks: [
    { deck, deckOutdated: true, cardCount: 12, reviewCount: 0 },
    { deck: capitals, deckOutdated: false, cardCount: 243, reviewCount: 30 },
    { deck: verbs, deckOutdated: true, cardCount: 0, reviewCount: 0 },
  ],
  deckCount: 2,
  cardCount: 255,
  reviewCount: 30,
  ...nothing,
  oldestFormat: { ...latest, deck: 1, card: 1, reviewState: 1 },
};

function renderNotice(overrides: Partial<Parameters<typeof MigrationNotice>[0]> = {}) {
  const props = {
    plan,
    busy: false,
    error: null,
    onMigrate: vi.fn(),
    ...overrides,
  };
  const view = render(<MigrationNotice {...props} />);
  return { ...view, props };
}

describe("describeOutdated", () => {
  it("names everything outdated, whichever there is", () => {
    expect(describeOutdated(plan, t)).toBe(
      "2 deck entries, 255 cards in 2 decks and 1 review state in one deck".replace(
        "1 review state",
        "30 review states",
      ),
    );
    expect(
      describeOutdated(
        {
          decks: [{ deck, deckOutdated: true, cardCount: 0, reviewCount: 0 }],
          deckCount: 1,
          cardCount: 0,
          reviewCount: 0,
          ...nothing,
        },
        t,
      ),
    ).toBe("1 deck entry");
    expect(
      describeOutdated(
        {
          decks: [{ deck, deckOutdated: false, cardCount: 1, reviewCount: 1 }],
          deckCount: 0,
          cardCount: 1,
          reviewCount: 1,
          preferencesOutdated: true,
          instanceOutdated: true,
          catalogMissing: false,
          oldestFormat: { ...latest, card: 1, reviewState: 1, preferences: 1 },
        },
        t,
      ),
    ).toBe(
      "the instance record, your preferences, 1 card in one deck and 1 review state in one deck",
    );
  });
});

describe("a missing catalog", () => {
  const catalogOnly: MigrationPlan = {
    decks: [],
    deckCount: 0,
    cardCount: 0,
    reviewCount: 0,
    preferencesOutdated: false,
    instanceOutdated: false,
    catalogMissing: true,
    oldestFormat: latest,
  };

  it("is named in what is outdated, in the formats, on the list and on the button", () => {
    expect(describeOutdated(catalogOnly, t)).toBe("the instance's catalog");
    expect(describeFormats(catalogOnly, t)).toBe(
      "a catalog of each instance's decks, which other apps read as a DCAT catalog",
    );
    renderNotice({ plan: catalogOnly });
    expect(screen.getByRole("region")).toHaveTextContent(
      "the instance's catalog is stored in an older format.",
    );
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Catalog of the decks",
    ]);
    expect(screen.getByRole("button", { name: "Update the catalog" })).toBeEnabled();
  });
});

describe("describeFormats", () => {
  it("names the formats the plan touches, with what each added since format 1", () => {
    expect(describeFormats(plan, t)).toBe(
      "deck format 6, which states which way a deck is studied, describes decks with the DCAT and SKOS standards, gives every deck a description, lets a deck's title and description be in several languages, no longer requires English in a deck's title and description and lets a deck's keywords be in any language you state, card format 7, which adds pictures on cards, adds a note under each side and a label above the back, lets a library deck retire a card it no longer uses, lets a card's text be in any language you state, no longer requires English in a card's notes and label, adds a label above a card's front and keeps what a card is about and review-state format 2, which keeps the day's undo snapshot whole or not at all",
    );
    expect(
      describeFormats(
        {
          decks: [],
          deckCount: 0,
          cardCount: 0,
          reviewCount: 0,
          preferencesOutdated: true,
          instanceOutdated: true,
          catalogMissing: false,
          oldestFormat: { ...latest, preferences: 1 },
        },
        t,
      ),
    ).toBe(
      "instance format 2 and preferences format 6, which records every setting, what to do with invalid data, the theme, the scheduler, the colors and the text size",
    );
  });

  it("names only what the steps after the oldest version found added", () => {
    expect(
      describeFormats(
        { ...plan, oldestFormat: { deck: 5, card: 6, reviewState: 1, preferences: 1 } },
        t,
      ),
    ).toBe(
      "deck format 6, which lets a deck's keywords be in any language you state, card format 7, which keeps what a card is about and review-state format 2, which keeps the day's undo snapshot whole or not at all",
    );
    expect(
      describeFormats(
        {
          ...plan,
          deckCount: 0,
          reviewCount: 0,
          preferencesOutdated: true,
          oldestFormat: { ...latest, card: 5, preferences: 4 },
        },
        t,
      ),
    ).toBe(
      "preferences format 6, which records the scheduler, the colors and the text size and card format 7, which adds a label above a card's front and keeps what a card is about",
    );
  });

  it("reads a version below 1 as format 1, as the data is read", () => {
    const cardsOnly = { ...plan, deckCount: 0, reviewCount: 0 };
    expect(describeFormats({ ...cardsOnly, oldestFormat: { ...latest, card: 0 } }, t)).toBe(
      describeFormats({ ...cardsOnly, oldestFormat: { ...latest, card: 1 } }, t),
    );
  });

  it("says what the newest step of every format this app writes added", () => {
    const behind = {
      deck: DECK_FORMAT_VERSION - 1,
      card: CARD_FORMAT_VERSION - 1,
      reviewState: REVIEW_STATE_FORMAT_VERSION - 1,
      preferences: PREFERENCES_FORMAT_VERSION - 1,
    };
    for (const kind of ["deck", "card", "reviewState", "preferences"] as const) {
      const described = describeFormats(
        {
          ...plan,
          deckCount: kind === "deck" ? 1 : 0,
          cardCount: kind === "card" ? 1 : 0,
          reviewCount: kind === "reviewState" ? 1 : 0,
          preferencesOutdated: kind === "preferences",
          oldestFormat: { ...latest, [kind]: behind[kind] },
        },
        t,
      );
      expect(described).toMatch(/, which \S/);
      expect(described).not.toMatch(/\s$/);
    }
  });
});

describe("MigrationNotice", () => {
  it("says what will be updated, deck by deck, and waits for the user", () => {
    const { props } = renderNotice();
    const region = screen.getByRole("region", { name: "Format update" });
    expect(region).toHaveTextContent(
      "2 deck entries, 255 cards in 2 decks and 30 review states in one deck are stored in an older format.",
    );
    expect(region).toHaveTextContent("Solid Memo now writes deck format 6");
    expect(region).toHaveTextContent("card format 7");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Kanji N5 — deck entry, 12 cards",
      "Capitals — 243 cards, 30 review states",
      "Verbs — deck entry",
    ]);
    expect(props.onMigrate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Update 3 decks" }));
    expect(props.onMigrate).toHaveBeenCalledOnce();
  });

  it("says a deck without a description gets one only for decks from before deck format 3", () => {
    const described = "A deck without a description gets a short one you can change.";
    const { unmount } = renderNotice();
    expect(screen.getByRole("region")).toHaveTextContent(described);
    unmount();
    renderNotice({ plan: { ...plan, oldestFormat: { ...plan.oldestFormat, deck: 3 } } });
    expect(screen.getByRole("region")).toHaveTextContent("stay as they are.");
    expect(screen.getByRole("region")).not.toHaveTextContent(described);
  });

  it("phrases a single card in a single deck", () => {
    renderNotice({
      plan: {
        decks: [{ deck, deckOutdated: false, cardCount: 1, reviewCount: 0 }],
        deckCount: 0,
        cardCount: 1,
        reviewCount: 0,
        ...nothing,
      },
    });
    expect(screen.getByRole("region")).toHaveTextContent(
      "1 card in one deck is stored in an older format.",
    );
    expect(screen.getByRole("button", { name: "Update 1 deck" })).toBeEnabled();
  });

  it("lists the preferences and the instance record, and names them on the button", () => {
    renderNotice({
      plan: {
        decks: [{ deck, deckOutdated: false, cardCount: 0, reviewCount: 2 }],
        deckCount: 0,
        cardCount: 0,
        reviewCount: 2,
        preferencesOutdated: true,
        instanceOutdated: true,
        catalogMissing: false,
        oldestFormat: { ...latest, reviewState: 1, preferences: 1 },
      },
    });
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Instance record",
      "Preferences",
      "Kanji N5 — 2 review states",
    ]);
    expect(
      screen.getByRole("button", { name: "Update 1 deck, preferences and the instance record" }),
    ).toBeEnabled();
  });

  it("names only the preferences on the button when no deck is outdated", () => {
    renderNotice({
      plan: {
        decks: [],
        deckCount: 0,
        cardCount: 0,
        reviewCount: 0,
        preferencesOutdated: true,
        instanceOutdated: false,
        catalogMissing: false,
        oldestFormat: { ...latest, preferences: 1 },
      },
    });
    expect(screen.getByRole("region")).toHaveTextContent(
      "your preferences is stored in an older format.",
    );
    expect(screen.getByRole("button", { name: "Update preferences" })).toBeEnabled();
  });

  it("shows progress and errors", () => {
    renderNotice({ busy: true, error: "write refused" });
    expect(screen.getByRole("button", { name: "Updating…" })).toBeDisabled();
    expect(screen.getByText("write refused")).toBeInTheDocument();
  });

  it("speaks Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <MigrationNotice plan={plan} busy={false} error={null} onMigrate={vi.fn()} />
      </I18nProvider>,
    );
    const region = screen.getByRole("region", { name: "Formatuppdatering" });
    expect(region).toHaveTextContent(
      "2 kortleksposter, 255 kort i 2 kortlekar och 30 repetitionstillstånd i en kortlek sparas i ett äldre format.",
    );
    expect(screen.getByRole("button", { name: "Uppdatera 3 kortlekar" })).toBeEnabled();
  });
});
