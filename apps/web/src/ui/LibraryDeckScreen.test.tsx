import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/preact";
import { LibraryDeckScreen } from "./LibraryDeckScreen";
import { licenseLabel } from "@solid-memo/domain/license";
import { NEW_TAB, newTab } from "../test/links";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { firstRelease } from "@solid-memo/domain/testing/libraryDeck";
import { I18nProvider } from "./i18n";

const CC0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const BY_SA = "https://creativecommons.org/licenses/by-sa/4.0/";
const WIKIPEDIA = "https://en.wikipedia.org/wiki/List_of_national_capitals";
const WIKIDATA = "https://www.wikidata.org/wiki/Property:P36";

const capitals: LibraryDeck = {
  url: "https://solid-memo.com/decks/capitals.ttl",
  ...firstRelease("https://solid-memo.com/decks/capitals.ttl"),
  title: { en: "Capitals of the world" },
  cardCount: 243,
  authors: ["Anton Wiklund"],
  license: CC0,
  description: { en: `Every country and its capital. Compiled from ${WIKIPEDIA}.` },
  createdAt: "2026-09-22T21:00:10.236Z",
  modifiedAt: "2026-09-27T20:12:13.000Z",
  direction: "bidirectional",
  sources: [
    {
      url: WIKIPEDIA,
      title: "List of national capitals",
      authors: ["Wikipedia contributors"],
      license: BY_SA,
    },
    { url: WIKIDATA, authors: [] },
  ],
};

function renderScreen(
  overrides: Partial<Parameters<typeof LibraryDeckScreen>[0]> = {},
) {
  const props = {
    deck: capitals,
    browseHref: "#/library-browse?deck=capitals",
    previewHref: "#/library-preview?deck=capitals",
    imported: false,
    busy: false,
    error: null,
    onImport: vi.fn(),
    ...overrides,
  };
  const view = render(<LibraryDeckScreen {...props} />);
  return { ...view, props };
}

/** The value shown under a term of the facts list. */
function fact(term: string): HTMLElement {
  const dt = screen.getByText(term, { selector: "dt" });
  return dt.nextElementSibling as HTMLElement;
}

describe("LibraryDeckScreen", () => {
  it("says what the deck is about, its keywords, and which release it is", () => {
    renderScreen({
      deck: {
        ...capitals,
        url: "https://solid-memo.com/decks/capitals/2.ttl",
        version: "2",
        versionNotes: "Added Norway.",
        releases: [
          { url: "https://solid-memo.com/decks/capitals/1.ttl", version: "1" },
          { url: "https://solid-memo.com/decks/capitals/2.ttl", version: "2", issued: "2026-09-28T10:00:00Z" },
        ],
        themes: [
          "http://publications.europa.eu/resource/authority/data-theme/EDUC",
          "https://pod.solid-memo.com/vocab/topics#geography",
          "https://pod.solid-memo.com/vocab/topics#languages",
        ],
        keywords: { en: ["capitals", "countries"], sv: ["huvudstäder", "länder"] },
      },
    });
    expect(fact("Topics")).toHaveTextContent("Languages, Geography");
    expect(fact("Keywords")).toHaveTextContent("capitals, countries");
    expect(fact("Release")).toHaveTextContent(/^Version 2, released .+$/);
    expect(fact("Release notes")).toHaveTextContent(/^Added Norway\.$/);
  });

  it("shows the keywords in the reader's language, and those in none, only", () => {
    const keywords = { "en-gb": ["capitals"], sv: ["huvudstäder"], "sv-fi": ["huvudstäder", "städer"], zxx: ["ISO 3166"] };
    renderScreen({ deck: { ...capitals, keywords } });
    expect(fact("Keywords")).toHaveTextContent(/^capitals, ISO 3166$/);
    cleanup();
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <LibraryDeckScreen
          deck={{ ...capitals, keywords }}
          browseHref="#/library-browse?deck=capitals"
          previewHref="#/library-preview?deck=capitals"
          imported={false}
          busy={false}
          error={null}
          onImport={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(fact("Nyckelord")).toHaveTextContent(/^huvudstäder, städer, ISO 3166$/);
  });

  it("shows no keywords when none are in the reader's language", () => {
    renderScreen({ deck: { ...capitals, keywords: { sv: ["huvudstäder"] } } });
    expect(screen.queryByText("Keywords", { selector: "dt" })).toBeNull();
  });

  it("uses the singular for one topic", () => {
    renderScreen({ deck: { ...capitals, themes: ["https://pod.solid-memo.com/vocab/topics#geography"] } });
    expect(fact("Topic")).toHaveTextContent("Geography");
  });

  it("shows the deck in full under a heading that links nowhere: the page is this one", () => {
    renderScreen();
    expect(
      screen.getByRole("heading", { name: "Capitals of the world" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Capitals of the world" })).toBeNull();
    expect(fact("Size")).toHaveTextContent("243 cards");

    expect(screen.getByText(/Every country and its capital/)).toHaveClass(
      "deck-description",
    );
    expect(screen.getAllByRole("link", { name: newTab(WIKIPEDIA) })).toHaveLength(1);

    expect(fact("Author")).toHaveTextContent("Anton Wiklund");
    expect(within(fact("Licence")).getByRole("link", { name: newTab("CC0 1.0") }))
      .toHaveAttribute("href", CC0);
    expect(fact("Created")).toHaveTextContent("September 22, 2026");
    expect(fact("Updated")).toHaveTextContent("September 27, 2026");
  });

  it("leaves out the dates a deck does not state", () => {
    const { createdAt: _c, modifiedAt: _m, ...undated } = capitals;
    renderScreen({ deck: undated });
    expect(screen.queryByText("Created", { selector: "dt" })).toBeNull();
    expect(screen.queryByText("Updated", { selector: "dt" })).toBeNull();
  });

  it("says which way the deck is studied", () => {
    renderScreen();
    expect(fact("Studied")).toHaveTextContent(
      "Both ways — every card is asked both ways; change it after importing",
    );
    renderScreen({ deck: { ...capitals, direction: "back-to-front" } });
    expect(screen.getAllByText("Back → front")).toHaveLength(1);
  });

  it("lists each source, linked, with its own authors and licence", () => {
    renderScreen();
    const sources = within(fact("Sources")).getAllByRole("listitem");
    expect(sources).toHaveLength(2);
    expect(
      within(sources[0]).getByRole("link", { name: newTab("List of national capitals") }),
    ).toHaveAttribute("href", WIKIPEDIA);
    expect(sources[0]).toHaveTextContent(
      `List of national capitals${NEW_TAB} — Wikipedia contributors · ${licenseLabel(BY_SA)}`,
    );
    expect(
      within(sources[0]).getByRole("link", { name: newTab(licenseLabel(BY_SA)) }),
    ).toHaveAttribute("href", BY_SA);
    expect(within(sources[1]).getByRole("link", { name: newTab(WIKIDATA) })).toHaveAttribute(
      "href",
      WIKIDATA,
    );
    expect(sources[1]).toHaveTextContent(WIKIDATA);
    expect(sources[1].textContent).not.toContain("—");
  });

  it("uses the plural for several authors and the singular for one source", () => {
    renderScreen({
      deck: {
        ...capitals,
        authors: ["Anton Wiklund", "A friend"],
        sources: [{ url: WIKIDATA, authors: ["Wikidata contributors"] }],
      },
    });
    expect(fact("Authors")).toHaveTextContent("Anton Wiklund, A friend");
    expect(fact("Source")).toHaveTextContent(
      `${WIKIDATA}${NEW_TAB} — Wikidata contributors`,
    );
  });

  it("links authors named with an address, of the deck and of a source", () => {
    renderScreen({
      deck: {
        ...capitals,
        authors: ["Anton Wiklund <anton@example.com>"],
        sources: [{ url: WIKIDATA, authors: ["Wiki <wiki@example.com>"] }],
      },
    });
    expect(
      within(fact("Author")).getByRole("link", { name: "Anton Wiklund" }),
    ).toHaveAttribute("href", "mailto:anton@example.com");
    expect(
      within(fact("Source")).getByRole("link", { name: "Wiki" }),
    ).toHaveAttribute("href", "mailto:wiki@example.com");
  });

  it("leaves out whatever the deck does not state", () => {
    const { container } = renderScreen({
      deck: {
        url: capitals.url,
        ...firstRelease(capitals.url),
        title: { en: "Rivers" },
        cardCount: 1,
        authors: [],
        direction: "front-to-back",
        sources: [],
      },
    });
    expect(container.querySelector(".deck-description")).toBeNull();
    expect(container.querySelectorAll("dt")).toHaveLength(3);
    expect(fact("Release")).toHaveTextContent(/^Version 1$/);
    expect(fact("Size")).toHaveTextContent("1 card");
    expect(fact("Studied")).toHaveTextContent("Front → back");
  });

  it("links to the card list", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Browse cards" })).toHaveAttribute(
      "href",
      "#/library-browse?deck=capitals",
    );
  });

  it("imports the deck on request", () => {
    const { props } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Import this deck" }));
    expect(props.onImport).toHaveBeenCalledOnce();
  });

  it("offers a preview right next to the import", () => {
    renderScreen();
    const preview = screen.getByRole("link", { name: "Preview" });
    expect(preview).toHaveAttribute("href", "#/library-preview?deck=capitals");
    expect(preview.previousElementSibling).toBe(
      screen.getByRole("button", { name: "Import this deck" }),
    );
  });

  it("locks the button while importing", () => {
    renderScreen({ busy: true });
    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
  });

  it("marks a deck the instance already holds, still importable", () => {
    renderScreen({ imported: true });
    expect(screen.getByText("Already imported")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import this deck" })).toBeEnabled();
  });

  it("shows an import error", () => {
    renderScreen({ error: "pod refused" });
    expect(screen.getByText("pod refused")).toHaveClass("error");
  });
});
