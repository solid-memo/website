import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { DraftsScreen } from "./DraftsScreen";
import { choose } from "../test/choose";
import { instanceA, makeDeck } from "../test/fixtures";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });

const draft = (name: string, extra: Partial<ReleaseDraftSummary> = {}): ReleaseDraftSummary => ({
  url: `${instanceA.url}drafts/${name}/v1/release.ttl`,
  instanceUrl: instanceA.url,
  name,
  version: 1,
  readable: true,
  title: { en: "Solid" },
  course: false,
  ...extra,
});

type Props = Parameters<typeof DraftsScreen>[0];

function renderScreen(overrides: Partial<Props> = {}) {
  const props: Props = {
    instance: instanceA,
    drafts: [],
    decks: [kanji, verbs],
    readOnly: null,
    healthHref: "#/health",
    creating: false,
    created: null,
    createError: null,
    onCreate: vi.fn(),
    deleting: null,
    deleted: null,
    deleteError: null,
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<DraftsScreen {...props} />);
  return props;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("DraftsScreen", () => {
  it("lists the drafts: their kind, version and state", () => {
    renderScreen({
      drafts: [
        draft("solid", { course: true, version: 2 }),
        draft("capitals", { title: {}, releasedAs: "https://pod.example/releases/capitals/v1.ttl" }),
        draft("broken", { readable: false, title: {} }),
      ],
    });
    const table = screen.getByRole("table", { name: "Drafts in Deck set A" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => within(row).getAllByRole("cell").slice(0, 3).map((cell) => cell.textContent))).toEqual([
      ["Course", "2", "Being written"],
      ["Deck", "1", "Released"],
      ["", "1", "Cannot be read"],
    ]);
    expect(within(rows[1]!).getByRole("rowheader")).toHaveTextContent("Untitled (capitals)");
  });

  it("says when there are none", () => {
    renderScreen();
    expect(screen.getByText("This instance has no drafts yet.")).toBeInTheDocument();
  });

  it("starts a blank deck or course by its name, in a language the user states", () => {
    const { onCreate } = renderScreen();
    fireEvent.input(screen.getByLabelText("Name"), { target: { value: "Capitals" } });
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(onCreate).not.toHaveBeenCalled();
    const picker = screen.getByRole("button", { name: "Language: not stated" });
    expect(picker).toHaveAccessibleDescription("Choose the language of the deck's name.");
    fireEvent.click(picker);
    fireEvent.click(screen.getByRole("radio", { name: "English (en)" }));
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(onCreate).toHaveBeenCalledWith({ kind: "blankDeck", title: { en: "Capitals" } });
    fireEvent.click(screen.getByRole("radio", { name: "A blank course" }));
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(onCreate).toHaveBeenLastCalledWith({ kind: "blankCourse", title: { en: "Capitals" } });
  });

  it("starts one of a deck of the instance, the next version of a release, or a file", () => {
    const { onCreate } = renderScreen();
    fireEvent.click(screen.getByRole("radio", { name: "A deck of this instance" }));
    choose("Deck", verbs.url);
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(onCreate).toHaveBeenLastCalledWith({ kind: "fromDeck", deck: verbs });
    fireEvent.click(screen.getByRole("radio", { name: "The next version of a release" }));
    const address = screen.getByRole("textbox", { name: "Address of the release" });
    expect(address).toHaveAccessibleDescription(/Where the release is published/);
    fireEvent.input(address, { target: { value: " https://solid-memo.com/decks/capitals/v1.ttl " } });
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(onCreate).toHaveBeenLastCalledWith({ kind: "nextVersionOf", url: "https://solid-memo.com/decks/capitals/v1.ttl" });
    fireEvent.click(screen.getByRole("radio", { name: "A release saved as a file" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose a file and create the draft…" }));
    expect(onCreate).toHaveBeenLastCalledWith({ kind: "fromFile" });
  });

  it("offers no deck to start from in an instance without one", () => {
    renderScreen({ decks: [] });
    expect(screen.getByRole("radio", { name: "A deck of this instance" })).toBeDisabled();
  });

  it("starts nothing while a draft is being made, and says what was made", () => {
    const { onCreate } = renderScreen({ creating: true });
    expect(screen.getByText("Creating the draft…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create the draft" }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("says what was made, and offers to start the next version of the release a copy is based on instead", () => {
    const basedOn = "https://solid-memo.com/decks/capitals/v1.ttl";
    const { onCreate } = renderScreen({ created: { draft: draft("capitals"), basedOn } });
    expect(screen.getByText("Created the draft Solid, version 1.")).toBeInTheDocument();
    expect(screen.getByText(basedOn)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start the next version of that release" }));
    expect(onCreate).toHaveBeenCalledWith({ kind: "nextVersionOf", url: basedOn });
  });

  it("deletes a draft once the user confirms, and says so", () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal("confirm", confirm);
    const solid = draft("solid");
    const { onDelete } = renderScreen({ drafts: [solid], deleted: draft("old", { title: {} }) });
    const button = screen.getByRole("button", { name: "Delete the draft Solid, version 1" });
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith("Delete the draft Solid, version 1? This cannot be undone.");
    expect(onDelete).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(button);
    expect(onDelete).toHaveBeenCalledWith(solid);
    expect(screen.getByText("Deleted the draft Untitled (old), version 1.")).toBeInTheDocument();
  });

  it("holds every delete while one is made", () => {
    renderScreen({ drafts: [draft("solid")], deleting: draft("solid") });
    expect(screen.getByRole("button", { name: "Delete the draft Solid, version 1" })).toBeDisabled();
    expect(screen.getByText("Deleting the draft Solid…")).toBeInTheDocument();
  });

  it("holds every change while the catalogue may not be changed, saying why", () => {
    renderScreen({ drafts: [draft("solid")], readOnly: "setAside" });
    expect(screen.getByText(/The instance's catalogue or one of its groups has invalid data/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete the draft Solid, version 1" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "A blank deck" })).toBeDisabled();
  });
});
