import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { applyDeckTreeEdit, type DeckGroup, type DeckTree, type DeckTreeEdit, type TreeNode } from "@solid-memo/domain/deckTree";
import { DeckListScreen, LEAVE_FALLBACK_MS } from "./DeckListScreen";
import { FLIP_FALLBACK_MS } from "./deckTree/useFlip";
import { I18nProvider } from "./i18n";
import type { Deck } from "@solid-memo/domain/deck";
import { statusTexts } from "../test/liveRegions";

const base = "https://pod.example/solid-memo/a/catalog.ttl";

function deckOf(id: string, title: string): Deck {
  return {
    id,
    url: `${base}#${id}`,
    title: { en: title },
    cardsDocumentUrl: `https://pod.example/solid-memo/a/decks/${id}.ttl`,
    reviewsDocumentUrl: `https://pod.example/solid-memo/a/reviews/${id}.ttl`,
    direction: "front-to-back",
    createdAt: "2026-09-21T10:00:00.000Z",
    formatVersion: 1,
    authors: [],
  };
}

const kanji = deckOf("deck-1", "Kanji N5");
const kana = deckOf("deck-2", "Kana");
const verbs = deckOf("deck-3", "Verbs");
const nouns = deckOf("deck-4", "Nouns");

const deck = (d: Deck): TreeNode => ({ kind: "deck", deck: d });
const group = (id: string, title: string, children: TreeNode[]): TreeNode => ({
  kind: "group",
  group: { url: `${base}#${id}`, title: { en: title } },
  children,
});
const japanese = `${base}#group-1`;
const grammar = `${base}#group-2`;
const other = `${base}#group-3`;
const fresh = `${base}#group-new`;

/** Kanji N5; Japanese (Kana; Grammar (Verbs)); Other (Nouns). */
const tree: DeckTree = {
  readOnly: false,
  children: [
    deck(kanji),
    group("group-1", "Japanese", [deck(kana), group("group-2", "Grammar", [deck(verbs)])]),
    group("group-3", "Other", [deck(nouns)]),
  ],
};

const flat: DeckTree = { readOnly: false, children: [deck(kanji), deck(kana)] };

type Props = Parameters<typeof DeckListScreen>[0];

/**
 * The screen over a tree that takes its edits, as the container makes
 * them: shown at once, and taken back when `fails` says the write failed.
 */
function Harness({
  initial,
  fails = () => false,
  slow = false,
  onEdit,
  onToggle,
  onUnfold,
  ...overrides
}: Partial<Props> & {
  initial: DeckTree;
  fails?: (edit: DeckTreeEdit) => boolean;
  /** Edits show a tick later, as the container's do (its write is queued first). */
  slow?: boolean;
  onEdit: (edit: DeckTreeEdit) => void;
  onToggle: (url: string) => void;
  onUnfold: (urls: readonly string[]) => void;
}) {
  const [shown, setShown] = useState(initial);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  return (
    <DeckListScreen
      tree={shown}
      collapsed={collapsed}
      onToggle={(url) => {
        onToggle(url);
        setCollapsed((all) => (all.has(url) ? new Set([...all].filter((other) => other !== url)) : new Set([...all, url])));
      }}
      onUnfold={(urls) => {
        onUnfold(urls);
        setCollapsed((all) => new Set([...all].filter((other) => !urls.includes(other))));
      }}
      onEdit={async (edit) => {
        onEdit(edit);
        // As the container does: a deleted group is folded no more.
        if (edit.kind === "removeGroup") setCollapsed((all) => new Set([...all].filter((other) => other !== edit.group)));
        const before = shown;
        if (slow) await Promise.resolve();
        setShown((current) => applyDeckTreeEdit(current, edit));
        if (!fails(edit)) return true;
        await Promise.resolve();
        setShown(before);
        return false;
      }}
      newGroup={(title): DeckGroup => ({ url: fresh, title })}
      error={null}
      libraryHref="#/library?instance=a"
      deckHref={(d) => `#/deck?deck=${d.id}`}
      renderStudyAction={(d) => <span>action for {d.title.en}</span>}
      createDeckHref="#/new-deck?instance=a"
      {...overrides}
    />
  );
}

function renderScreen(initial: DeckTree = tree, options: Partial<Parameters<typeof Harness>[0]> = {}) {
  const onEdit = vi.fn();
  const onToggle = vi.fn();
  const onUnfold = vi.fn();
  const view = render(
    <Harness initial={initial} onEdit={onEdit} onToggle={onToggle} onUnfold={onUnfold} {...options} />,
  );
  return { ...view, onEdit, onToggle, onUnfold };
}

/** The row (a deck's `li`, a group's header) of a deck or group. */
function row(key: string): HTMLElement {
  return document.querySelector<HTMLElement>(`[data-row-key="${key}"]`)!;
}

function openMoves(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Move ${name}` }));
}

afterEach(() => vi.unstubAllGlobals());

/** A browser that does, or does not, ask for reduced motion. */
function setReducedMotion(reduce: boolean) {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reduce } as MediaQueryList);
}

/** The deleted group's header done folding away. */
function headerFolded(key: string, animationName = "group-leave") {
  fireEvent.animationEnd(row(key), { animationName });
}

function stubConfirm(answer: boolean) {
  const confirm = vi.fn(() => answer);
  vi.stubGlobal("confirm", confirm);
  return confirm;
}

describe("DeckListScreen", () => {
  it("lists every deck and group under a Decks heading, counting all decks", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Decks" })).toBeInTheDocument();
    // The heading names this page: it is no link to it.
    expect(screen.queryByRole("link", { name: "Decks" })).toBeNull();
    expect(screen.getByText("4 decks")).toBeInTheDocument();
    for (const name of ["Kanji N5", "Kana", "Verbs", "Nouns"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Japanese 2 decks", expanded: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grammar 1 deck", expanded: true })).toBeInTheDocument();
  });

  it("nests a group's members in a list of their own, each row knowing its depth", () => {
    renderScreen();
    expect(row(kanji.url).getAttribute("style")).toContain("--depth: 0");
    expect(row(kana.url).getAttribute("style")).toContain("--depth: 1");
    expect(row(verbs.url).getAttribute("style")).toContain("--depth: 2");
    expect(row(grammar).getAttribute("style")).toContain("--depth: 1");
    expect(row(verbs.url).closest("ul")!.getAttribute("style")).toContain("--depth: 2");
    expect(row(verbs.url).closest(".deck-group")!.querySelector(".deck-group-header")).toBe(row(grammar));
  });

  it("uses the singular for one deck", () => {
    renderScreen({ readOnly: false, children: [deck(kanji)] });
    expect(screen.getByText("1 deck")).toBeInTheDocument();
  });

  it("shows an empty state without decks or groups", () => {
    renderScreen({ readOnly: false, children: [] });
    expect(screen.getByText(/No decks yet/)).toBeInTheDocument();
  });

  it("still shows a group without decks, and says it is empty", () => {
    renderScreen({ readOnly: false, children: [group("group-1", "Japanese", [])] });
    expect(screen.queryByText(/No decks yet/)).toBeNull();
    expect(screen.getByText("0 decks", { selector: ".deck-group-header .hint" })).toBeInTheDocument();
    expect(screen.getByText("Nothing in this group yet.")).toBeInTheDocument();
  });

  it("links each deck's name to that deck's page, and leaves its study suggestion to the container", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Kanji N5" })).toHaveAttribute("href", "#/deck?deck=deck-1");
    expect(screen.getByRole("link", { name: "Verbs" })).toHaveAttribute("href", "#/deck?deck=deck-3");
    expect(screen.getByText("action for Verbs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Study/ })).toBeNull();
  });

  it("marks the title, decks, groups and buttons with decorative icons", () => {
    const { container } = renderScreen();
    expect(container.querySelector("h2 svg.icon")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".deck-open svg.icon")).toHaveLength(4);
    expect(container.querySelectorAll(".group-toggle svg.icon")).toHaveLength(6);
    for (const icon of container.querySelectorAll("button svg")) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("offers no editing of decks: they are renamed and removed in the Browser", () => {
    renderScreen(flat);
    expect(screen.queryByRole("button", { name: /Remove|Rename|Delete/ })).toBeNull();
  });

  it("folds a group shut and open, out of the tab order while shut", () => {
    const { onToggle } = renderScreen();
    const toggle = screen.getByRole("button", { name: "Japanese 2 decks" });
    const body = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(body).toHaveClass("deck-group-body");
    expect(body).not.toHaveAttribute("inert");
    expect(body).not.toHaveAttribute("data-collapsed");

    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(japanese);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(body).toHaveAttribute("inert");
    expect(body).toHaveAttribute("data-collapsed");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(body).not.toHaveAttribute("inert");
  });

  it("opens a deck's moves under it, and closes them again", () => {
    renderScreen();
    const button = screen.getByRole("button", { name: "Move Kana" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-controls");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const panel = document.getElementById(button.getAttribute("aria-controls")!)!;
    expect(row(kana.url)).toContainElement(panel);
    expect(within(panel).getByRole("button", { name: "Move up" })).toHaveFocus();
    expect(within(panel).getByRole("button", { name: "Move down" })).toBeInTheDocument();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".move-panel")).toBeNull();
  });

  it("opens only one row's moves at a time", () => {
    renderScreen();
    openMoves("Kana");
    openMoves("Kanji N5");
    expect(document.querySelectorAll(".move-panel")).toHaveLength(1);
    expect(row(kanji.url)).toContainElement(document.querySelector(".move-panel"));
  });

  it("closes the moves on Escape, back on the Move button", () => {
    renderScreen();
    openMoves("Kana");
    fireEvent.keyDown(screen.getByRole("button", { name: "Move down" }), { key: "Escape" });
    expect(document.querySelector(".move-panel")).toBeNull();
    expect(screen.getByRole("button", { name: "Move Kana" })).toHaveFocus();
  });

  it("keeps the moves open on another key", () => {
    renderScreen();
    openMoves("Kana");
    fireEvent.keyDown(screen.getByRole("button", { name: "Move down" }), { key: "Tab" });
    expect(document.querySelector(".move-panel")).not.toBeNull();
  });

  it("moves a deck down past its neighbour, says where, and keeps focus on its Move button", () => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kanji N5");
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: kanji.url, to: { parent: null, after: kana.url } });
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(["Kana", "Kanji N5", "Create deck", "Deck library"]);
    expect(statusTexts()).toEqual(["Moved Kanji N5: 2 of 2 at the top level."]);
    expect(screen.getByRole("button", { name: "Move Kanji N5" })).toHaveFocus();
    expect(document.querySelector(".move-panel")).toBeNull();
  });

  it("moves a deck up: first, or after the one two above", () => {
    const three: DeckTree = { readOnly: false, children: [deck(kanji), deck(kana), deck(verbs)] };
    const { onEdit } = renderScreen(three);
    openMoves("Verbs");
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "move", node: verbs.url, to: { parent: null, after: kanji.url } });
    openMoves("Verbs");
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "move", node: verbs.url, to: { parent: null, after: null } });
    expect(statusTexts()).toEqual(["Moved Verbs: 1 of 3 at the top level."]);
  });

  it("marks the moves the place rules out, and does nothing on them", () => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kanji N5");
    for (const name of ["Move up", "Group with the one above"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(button);
    }
    expect(screen.getByRole("button", { name: "Move down" })).toHaveAttribute("aria-disabled", "false");
    openMoves("Kana");
    for (const name of ["Move down", "Group with the one below"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(screen.getByRole("button", { name }));
    }
    expect(onEdit).not.toHaveBeenCalled();
    // At the top level there is no group to move out of, nor one to move into.
    expect(screen.queryByRole("button", { name: /Move out of/ })).toBeNull();
    expect(screen.queryByRole("group", { name: "Move into" })).toBeNull();
  });

  it("moves a deck out of its group, to right after the group", () => {
    const { onEdit } = renderScreen();
    openMoves("Verbs");
    fireEvent.click(screen.getByRole("button", { name: "Move out of Grammar" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: verbs.url, to: { parent: japanese, after: grammar } });
    expect(statusTexts()).toEqual(["Moved Verbs: 3 of 3 in Japanese."]);
    expect(screen.getByRole("button", { name: "Move Verbs" })).toHaveFocus();
  });

  it("offers every group to move into but its own, and the group it is in", () => {
    renderScreen();
    openMoves("Japanese");
    expect(
      within(screen.getByRole("group", { name: "Move into" }))
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Other"]);
    openMoves("Kana");
    expect(
      within(screen.getByRole("group", { name: "Move into" }))
        .getAllByRole("button")
        .map((button) => [button.textContent, button.style.getPropertyValue("--depth")]),
    ).toEqual([
      ["Grammar", "1"],
      ["Other", "0"],
    ]);
  });

  it("moves into a group at its end, opening it if it was shut", () => {
    const { onEdit, onUnfold } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Other 1 deck" }));
    openMoves("Kanji N5");
    fireEvent.click(within(screen.getByRole("group", { name: "Move into" })).getByRole("button", { name: "Other" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: kanji.url, to: { parent: other, after: nouns.url } });
    expect(onUnfold).toHaveBeenCalledWith([other]);
    expect(screen.getByRole("button", { name: "Other 2 decks", expanded: true })).toBeInTheDocument();
    expect(statusTexts()).toEqual(["Moved Kanji N5: 2 of 2 in Other."]);
    expect(screen.getByRole("button", { name: "Move Kanji N5" })).toHaveFocus();
  });

  it("opens every group folded shut around the one moved into, at once", () => {
    const { onUnfold } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Grammar 1 deck" }));
    fireEvent.click(screen.getByRole("button", { name: "Japanese 2 decks" }));
    openMoves("Kanji N5");
    fireEvent.click(within(screen.getByRole("group", { name: "Move into" })).getByRole("button", { name: "Grammar" }));
    expect(onUnfold).toHaveBeenCalledOnce();
    expect(onUnfold).toHaveBeenCalledWith([grammar, japanese]);
    expect(screen.getByRole("button", { name: "Japanese 3 decks", expanded: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Kanji N5" })).toHaveFocus();
  });

  it("moves into an empty group as its first", () => {
    const { onEdit, onUnfold } = renderScreen({ readOnly: false, children: [deck(kanji), group("group-1", "Japanese", [])] });
    openMoves("Kanji N5");
    fireEvent.click(within(screen.getByRole("group", { name: "Move into" })).getByRole("button", { name: "Japanese" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: kanji.url, to: { parent: japanese, after: null } });
    expect(onUnfold).not.toHaveBeenCalled();
  });

  it("moves a group with what it holds", () => {
    const { onEdit } = renderScreen();
    openMoves("Japanese");
    fireEvent.click(screen.getByRole("button", { name: "Move up" }));
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: japanese, to: { parent: null, after: null } });
    expect(screen.getAllByRole("link").map((link) => link.textContent).slice(0, 4)).toEqual(["Kana", "Verbs", "Kanji N5", "Nouns"]);
    expect(screen.getByRole("button", { name: "Move Japanese" })).toHaveFocus();
  });

  it("groups a deck with the one above in a new group, and opens its name to edit", () => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    expect(onEdit).toHaveBeenCalledWith({
      kind: "combine",
      dragged: kana.url,
      target: kanji.url,
      group: { url: fresh, title: { en: "New group" } },
    });
    expect(statusTexts()).toEqual(['Put Kanji N5 and Kana in a new group. Name it, or press Escape to keep "New group".']);
    const field = screen.getByRole("textbox", { name: "Group name" }) as HTMLInputElement;
    expect(field).toHaveFocus();
    expect(field.value).toBe("New group");
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 9]);
    expect(row(fresh).closest(".deck-group")!.querySelectorAll(".deck-row")).toHaveLength(2);
  });

  it("groups a deck with the one below, which keeps its place first", () => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kanji N5");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one below" }));
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "combine", dragged: kana.url, target: kanji.url }),
    );
    expect(screen.getAllByRole("link").map((link) => link.textContent).slice(0, 2)).toEqual(["Kanji N5", "Kana"]);
  });

  it("names a new group with Enter, in the page's language, and focuses it", async () => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    const field = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.input(field, { target: { value: "  Japanese  " } });
    fireEvent.submit(field.closest("form")!);
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "rename", group: fresh, title: { en: "Japanese" } });
    expect(statusTexts()).toEqual(['Renamed the group to "Japanese".']);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Japanese 2 decks" })).toHaveFocus();
  });

  it.each([
    ["Escape", (field: HTMLElement) => fireEvent.keyDown(field, { key: "Escape" })],
    [
      "leaving it empty",
      (field: HTMLElement) => {
        fireEvent.input(field, { target: { value: " " } });
        fireEvent.focusOut(field);
      },
    ],
    ["leaving it as it was", (field: HTMLElement) => fireEvent.focusOut(field)],
  ])("keeps the group's name on %s", (_, close) => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    close(screen.getByRole("textbox", { name: "Group name" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "New group 2 decks" })).toHaveFocus();
  });

  it("leaves focus on the control the user went to from the field", () => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    const field = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.input(field, { target: { value: "Japanese" } });
    const create = screen.getByRole("link", { name: "Create deck" });
    create.focus();
    fireEvent.focusOut(field, { relatedTarget: create });
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "rename", group: fresh, title: { en: "Japanese" } });
    expect(create).toHaveFocus();
  });

  it("keeps the field open on other keys, and while focus stays in it", () => {
    renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    const field = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.keyDown(field, { key: "a" });
    fireEvent.focusOut(field, { relatedTarget: screen.getByRole("button", { name: "Save name" }) });
    expect(screen.getByRole("textbox", { name: "Group name" })).toBeInTheDocument();
  });

  it("keeps a name typed when focus leaves the field, once", async () => {
    const { onEdit } = renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    const field = screen.getByRole("textbox", { name: "Group name" });
    fireEvent.input(field, { target: { value: "Japanese" } });
    // Enter, and as the field goes, the browser saying it lost focus: both before the screen renders again.
    field.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).toBeNull();
    });
    expect(onEdit).toHaveBeenCalledTimes(2);
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "rename", group: fresh, title: { en: "Japanese" } });
  });

  it("closes the name field, back on the deck, when the new group could not be made", async () => {
    renderScreen(flat, { fails: (edit) => edit.kind === "combine" });
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    await waitFor(() => {
      expect(screen.queryByRole("textbox")).toBeNull();
    });
    expect(row(fresh)).toBeNull();
    expect(screen.getByRole("button", { name: "Move Kanji N5" })).toHaveFocus();
  });

  it("leaves a name already given alone when the new group could not be made", async () => {
    const { onEdit } = renderScreen(flat, { fails: (edit) => edit.kind === "combine" });
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Group name" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Move Kanji N5" }));
    await waitFor(() => {
      expect(row(fresh)).toBeNull();
    });
    expect(onEdit).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Move Kanji N5" })).toHaveFocus();
  });

  it("renames a group from its header", () => {
    const { onEdit } = renderScreen();
    openMoves("Japanese");
    fireEvent.click(screen.getByRole("button", { name: "Rename group Japanese" }));
    expect(document.querySelector(".move-panel")).toBeNull();
    expect(screen.getByRole("button", { name: "Rename group Japanese" })).toBeDisabled();
    const field = screen.getByRole("textbox", { name: "Group name" }) as HTMLInputElement;
    expect(field.value).toBe("Japanese");
    fireEvent.input(field, { target: { value: "Nihongo" } });
    fireEvent.submit(field.closest("form")!);
    expect(onEdit).toHaveBeenCalledWith({ kind: "rename", group: japanese, title: { en: "Nihongo" } });
    expect(screen.getByRole("button", { name: "Nihongo 2 decks" })).toHaveFocus();
  });

  it("deletes a group once confirmed, its members moving up, focus on the first of them", () => {
    const confirm = stubConfirm(true);
    const { onEdit } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Delete group Japanese" }));
    expect(confirm).toHaveBeenCalledWith('Delete the group "Japanese"? Its 2 decks are kept, one level up.');
    // Its header folds away first; a row in it ending an animation of its own is no end of that.
    expect(row(japanese).closest("li")).toHaveClass("leaving");
    headerFolded(japanese, "bounce-in");
    expect(onEdit).not.toHaveBeenCalled();
    headerFolded(japanese);
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledWith({ kind: "removeGroup", group: japanese });
    expect(row(japanese)).toBeNull();
    expect(screen.getByRole("button", { name: "Move Kana" })).toHaveFocus();
    expect(statusTexts()).toEqual(['Deleted the group "Japanese"; what it held moved up one level.']);
  });

  it("puts focus on what a group folded shut held once it is deleted, not while that is out of reach", async () => {
    stubConfirm(true);
    // As a browser does: nothing in an inert part of the page takes focus.
    const focus = HTMLElement.prototype.focus;
    vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement, options) {
      if (this.closest("[inert]") === null) focus.call(this, options);
    });
    renderScreen(tree, { slow: true });
    fireEvent.click(screen.getByRole("button", { name: "Japanese 2 decks" }));
    const remove = screen.getByRole("button", { name: "Delete group Japanese" });
    remove.focus();
    fireEvent.click(remove);
    expect(remove).toHaveFocus();
    headerFolded(japanese);
    await waitFor(() => {
      expect(row(japanese)).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Move Kana" })).toHaveFocus();
    vi.restoreAllMocks();
  });

  it("keeps a group when deleting it is not confirmed", () => {
    const confirm = stubConfirm(false);
    const { onEdit } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Delete group Grammar" }));
    expect(confirm).toHaveBeenCalledWith('Delete the group "Grammar"? Its 1 deck is kept, one level up.');
    expect(onEdit).not.toHaveBeenCalled();
    expect(row(grammar)).not.toBeNull();
  });

  it("deletes a group at once under reduced motion", () => {
    setReducedMotion(true);
    const confirm = stubConfirm(true);
    renderScreen({ readOnly: false, children: [group("group-1", "Japanese", [group("group-2", "Grammar", [])])] });
    fireEvent.click(screen.getByRole("button", { name: "Delete group Grammar" }));
    expect(confirm).toHaveBeenCalledWith('Delete the empty group "Grammar"?');
    expect(row(grammar)).toBeNull();
    expect(document.querySelector(".leaving")).toBeNull();
    expect(statusTexts()).toEqual(['Deleted the group "Grammar".']);
    expect(screen.getByRole("button", { name: "Japanese 0 decks" })).toHaveFocus();
    vi.restoreAllMocks();
  });

  it("deletes a group once given time enough to fold away, should the animation's end never be heard", () => {
    vi.useFakeTimers();
    stubConfirm(true);
    const { onEdit } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Delete group Grammar" }));
    act(() => {
      vi.advanceTimersByTime(LEAVE_FALLBACK_MS - 1);
    });
    expect(onEdit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onEdit).toHaveBeenCalledWith({ kind: "removeGroup", group: grammar });
    expect(row(grammar)).toBeNull();
    vi.useRealTimers();
  });

  it("deletes a group even when the list goes while its header folds away", () => {
    vi.useFakeTimers();
    stubConfirm(true);
    const { onEdit, unmount } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Delete group Grammar" }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(LEAVE_FALLBACK_MS);
    });
    expect(onEdit).toHaveBeenCalledWith({ kind: "removeGroup", group: grammar });
    vi.useRealTimers();
  });

  it("unfolds a group's header again when deleting it fails", async () => {
    stubConfirm(true);
    renderScreen(tree, { fails: (edit) => edit.kind === "removeGroup" });
    fireEvent.click(screen.getByRole("button", { name: "Delete group Grammar" }));
    headerFolded(grammar);
    await waitFor(() => {
      expect(row(grammar)).not.toBeNull();
    });
    expect(row(grammar).closest("li")).not.toHaveClass("leaving");
  });

  it("asks before deleting a group of groups with no decks, keeping its groups", () => {
    const confirm = stubConfirm(true);
    renderScreen({ readOnly: false, children: [group("group-1", "Japanese", [group("group-2", "Grammar", [])])] });
    fireEvent.click(screen.getByRole("button", { name: "Delete group Japanese" }));
    headerFolded(japanese);
    expect(confirm).toHaveBeenCalledWith('Delete the group "Japanese"? The groups in it are kept, one level up.');
    expect(statusTexts()).toEqual(['Deleted the group "Japanese"; what it held moved up one level.']);
    expect(screen.getByRole("button", { name: "Move Grammar" })).toHaveFocus();
  });

  it("moves focus to the heading after deleting an empty group at the top level", () => {
    stubConfirm(true);
    renderScreen({ readOnly: false, children: [deck(kanji), group("group-1", "Japanese", [])] });
    fireEvent.click(screen.getByRole("button", { name: "Delete group Japanese" }));
    expect(screen.getByRole("heading", { name: "Decks" })).toHaveFocus();
  });

  it("leaves focus where the user took it after an edit", () => {
    renderScreen();
    openMoves("Kanji N5");
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(screen.getByRole("button", { name: "Move Kanji N5" })).toHaveFocus();
    const create = screen.getByRole("link", { name: "Create deck" });
    create.focus();
    fireEvent.click(screen.getByRole("button", { name: "Other 1 deck" }));
    expect(create).toHaveFocus();
  });

  it("leaves focus on the page once the user points elsewhere after an edit", () => {
    renderScreen();
    openMoves("Kanji N5");
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    const move = screen.getByRole("button", { name: "Move Kanji N5" });
    expect(move).toHaveFocus();
    // A press on the page around the list: focus goes to the page.
    fireEvent.pointerDown(document.body);
    move.blur();
    fireEvent.click(screen.getByRole("button", { name: "Other 1 deck" }));
    expect(document.body).toHaveFocus();
  });

  it("puts focus nowhere when the deck to go back to is gone", async () => {
    let settle: (written: boolean) => void = () => undefined;
    const props: Props = {
      tree: flat,
      collapsed: new Set(),
      onToggle: () => undefined,
      onUnfold: () => undefined,
      onEdit: () => new Promise<boolean>((resolve) => (settle = resolve)),
      newGroup: (title) => ({ url: fresh, title }),
      error: null,
      libraryHref: "#/library?instance=a",
      deckHref: (d) => `#/deck?deck=${d.id}`,
      renderStudyAction: () => null,
      createDeckHref: "#/new-deck?instance=a",
    };
    const { rerender } = render(<DeckListScreen {...props} />);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    // Deleted elsewhere meanwhile.
    rerender(<DeckListScreen {...props} tree={{ readOnly: false, children: [deck(kana)] }} />);
    await act(async () => settle(false));
    expect(document.activeElement).toBe(document.body);
  });

  it("only shows a list arranged by a newer version, with nothing to change it", () => {
    renderScreen({ ...tree, readOnly: true });
    expect(screen.getByText(/A newer version of Solid Memo arranged these decks/)).toBeInTheDocument();
    for (const button of screen.getAllByRole("button", { name: /^(Move|Rename group|Delete group) / })) {
      expect(button).toBeDisabled();
    }
    // Folding is this device's own, and stays.
    expect(screen.getByRole("button", { name: "Japanese 2 decks" })).toBeEnabled();
  });

  it("says why an edit was not made", () => {
    renderScreen(tree, { error: "Your decks were rearranged elsewhere." });
    expect(screen.getByRole("alert")).toHaveTextContent("Your decks were rearranged elsewhere.");
  });

  it("links to the deck library and to the deck creator, styled as the primary button", () => {
    renderScreen();
    expect(screen.getByRole("link", { name: "Deck library" })).toHaveAttribute("href", "#/library?instance=a");
    const link = screen.getByRole("link", { name: "Create deck" });
    expect(link).toHaveClass("button", "primary");
    expect(link).toHaveAttribute("href", "#/new-deck?instance=a");
  });
});

describe("DeckListScreen moving rows", () => {
  const SLIDE = "transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1)";

  beforeEach(() => {
    vi.useFakeTimers();
    // Each row 40px under the one before; the list itself, and anything else, nowhere.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const index = [...document.querySelectorAll("[data-row-key]")].indexOf(this);
      return index === -1 ? new DOMRect() : new DOMRect(0, index * 40, 500, 40);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("slides the rows a keyboard move puts in new places", () => {
    renderScreen(tree);
    openMoves("Kanji N5");
    fireEvent.click(screen.getByRole("button", { name: "Move down" }));
    expect(row(kanji.url).style.transition).toBe(SLIDE);
    expect(row(japanese).style.transition).toBe(SLIDE);
    expect(row(other).style.transition).toBe("");
    expect(document.querySelector(".deck-tree")).toHaveAttribute("data-arranged");
    fireEvent.transitionEnd(row(kanji.url));
    expect(row(kanji.url).style.transition).toBe("");
  });

  it("brings a new group's header in, the two it holds sliding into it", () => {
    renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    expect(row(fresh)).toHaveClass("row-enter");
    expect(row(kanji.url).style.transition).toBe(SLIDE);
    act(() => {
      vi.advanceTimersByTime(FLIP_FALLBACK_MS);
    });
    expect(row(fresh)).not.toHaveClass("row-enter");
  });

  it("slides what a deleted group held into its place once its header has folded away", () => {
    stubConfirm(true);
    renderScreen(tree);
    fireEvent.click(screen.getByRole("button", { name: "Delete group Japanese" }));
    expect(row(kana.url).style.transition).toBe("");
    fireEvent.animationEnd(row(japanese), { animationName: "group-leave" });
    expect(row(kana.url).style.transition).toBe(SLIDE);
  });

  it("puts each row in its place at once under reduced motion", () => {
    setReducedMotion(true);
    renderScreen(flat);
    openMoves("Kana");
    fireEvent.click(screen.getByRole("button", { name: "Group with the one above" }));
    expect(row(fresh)).not.toHaveClass("row-enter");
    expect(row(kanji.url).style.transition).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("DeckListScreen in Swedish", () => {
  it("speaks Swedish inside a Swedish provider, and names a new group in Swedish", () => {
    const onEdit = vi.fn();
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <Harness initial={flat} onEdit={onEdit} onToggle={() => undefined} onUnfold={() => undefined} />
      </I18nProvider>,
    );
    expect(screen.getByRole("heading", { name: "Kortlekar" })).toBeInTheDocument();
    expect(screen.getByText("2 kortlekar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skapa kortlek" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Flytta Kana" }));
    fireEvent.click(screen.getByRole("button", { name: "Gruppera med den ovanför" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ group: { url: fresh, title: { sv: "Ny grupp" } } }));
    const field = screen.getByRole("textbox", { name: "Gruppens namn" });
    fireEvent.input(field, { target: { value: "Japanska" } });
    fireEvent.submit(field.closest("form")!);
    expect(onEdit).toHaveBeenLastCalledWith({ kind: "rename", group: fresh, title: { sv: "Japanska" } });
  });
});

describe("DeckListScreen dragging", () => {
  /** Where the list begins on screen: its rows from there, each 40px tall and 8px below the one before. */
  let listTop = 100;
  /** The page's y of row `index` (in the order shown), `offset` pixels into it. */
  const yOf = (index: number, offset = 20) => listTop + index * 48 + offset;
  /** Called as the list itself is measured. */
  let onListMeasured = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    listTop = 100;
    onListMeasured = () => {};
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("deck-tree")) {
        onListMeasured();
        return new DOMRect(0, listTop, 600, 1000);
      }
      // The copy that follows the pointer, where it was placed.
      const placed = /translate3d\((.+)px, (.+)px, 0\)/.exec(this.style.transform);
      if (placed !== null) return new DOMRect(Number(placed[1]), Number(placed[2]), 500, 40);
      const shown = [...document.querySelectorAll("[data-row-key]")].filter((element) => element.closest("[data-collapsed]") === null);
      const index = shown.indexOf(this);
      return index === -1 ? new DOMRect() : new DOMRect(10, yOf(index, 0), 500, 40);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** A pointer of a kind, pressing, moving and letting go at a height on the page. */
  function pointer(pointerType: "touch" | "pen" | "mouse", pointerId = 1) {
    const at = (y: number) => ({ pointerId, pointerType, clientX: 50, clientY: y, button: 0, isPrimary: true });
    return {
      down: (target: Element, y: number, init: object = {}) => fireEvent.pointerDown(target, { ...at(y), ...init }),
      move: (y: number) => fireEvent.pointerMove(window, at(y)),
      up: (y: number) => fireEvent.pointerUp(window, at(y)),
    };
  }

  const wait = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  /** The row's own handle: its link, or a group's fold button. */
  function handle(key: string): HTMLElement {
    return row(key).querySelector<HTMLElement>(".deck-open, .group-toggle")!;
  }

  /** Lifts the row at `index` with a long press of a finger. */
  function lift(key: string, index: number, touch = pointer("touch")) {
    touch.down(handle(key), yOf(index));
    wait(400);
    return touch;
  }

  const line = () => document.querySelector<HTMLElement>(".drop-line")!;
  const ghost = () => document.querySelector<HTMLElement>(".drag-ghost");
  const dragging = () => document.documentElement.classList.contains("drag-active");

  it("lifts a row on a long press, follows the finger, and drops it where the line shows", () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const { onEdit } = renderScreen();
    const touch = pointer("touch");
    touch.down(handle(kanji.url), yOf(0));
    // Held, before it lifts: it gives a little.
    expect(row(kanji.url)).toHaveClass("press-pending");
    expect(ghost()).toBeNull();
    wait(400);
    expect(vibrate).toHaveBeenCalledWith(10);
    expect(dragging()).toBe(true);
    expect(row(kanji.url)).toHaveClass("drag-source");
    expect(document.querySelector(".deck-tree")).toHaveAttribute("data-dragging");
    expect(ghost()).toHaveTextContent("Kanji N5");
    expect(ghost()).toHaveAttribute("aria-hidden", "true");
    expect(ghost()!.style.width).toBe("500px");
    // Between Kana and Grammar, in Japanese.
    touch.move(yOf(2, 44));
    expect(ghost()!.style.transform).toBe("translate3d(10px, 220px, 0)");
    expect(line().hidden).toBe(false);
    expect(line().style.transform).toBe("translateY(140px)");
    expect(line().style.getPropertyValue("--line-depth")).toBe("1");
    expect(line().dataset.label).toBe("in Japanese");
    const settled: string[] = [];
    onListMeasured = () => settled.push(row(kanji.url).style.transform);
    touch.up(yOf(2, 44));
    expect(settled).toContain("translate(0px, 24px)");
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: kanji.url, to: { parent: japanese, after: kana.url } });
    expect(statusTexts()).toEqual(["Moved Kanji N5: 2 of 3 in Japanese."]);
    expect(dragging()).toBe(false);
    expect(ghost()).toBeNull();
    expect(line().hidden).toBe(true);
    expect(document.querySelector(".deck-tree")).not.toHaveAttribute("data-dragging");
    // Once arranged, the rows no longer slide in as they come.
    expect(document.querySelector(".deck-tree")).toHaveAttribute("data-arranged");
    // A pointer's move leaves focus where it was.
    expect(screen.getByRole("button", { name: "Move Kanji N5" })).not.toHaveFocus();
    // It settles from where it was let go; the rows it passed slide up to make way.
    expect(row(kanji.url).style.transition).toBe("transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1)");
    expect(row(japanese).style.transition).toBe("transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1)");
    expect(row(grammar).style.transition).toBe("");
    // The click the drop ends in opens nothing; the next one does.
    expect(fireEvent.click(handle(kanji.url))).toBe(false);
    expect(fireEvent.click(handle(kanji.url))).toBe(true);
    Reflect.deleteProperty(navigator, "vibrate");
  });

  it("lifts a row under a mouse once it moves with the button down, and drops it into a group by its header", () => {
    const { onEdit, onUnfold } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Other 1 deck" }));
    const mouse = pointer("mouse");
    mouse.down(handle(kanji.url), yOf(0));
    expect(row(kanji.url)).not.toHaveClass("press-pending");
    mouse.move(yOf(0, 23));
    expect(dragging()).toBe(false);
    mouse.move(yOf(0, 25));
    expect(dragging()).toBe(true);
    // The middle of Other's header, folded shut: into it, at its end.
    mouse.move(yOf(5));
    expect(row(other)).toHaveClass("drop-into");
    expect(row(other).querySelectorAll("svg")[1]!.querySelectorAll("path")).toHaveLength(2);
    expect(line().hidden).toBe(true);
    mouse.up(yOf(5));
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: kanji.url, to: { parent: other, after: nouns.url } });
    expect(onUnfold).toHaveBeenCalledWith([other]);
    expect(row(other)).not.toHaveClass("drop-into");
    // The click goes through once the drag is long gone.
    wait(500);
    expect(fireEvent.click(handle(kanji.url))).toBe(true);
  });

  it("takes a slow click for a click, not a drag", () => {
    const { onEdit } = renderScreen();
    const mouse = pointer("mouse");
    mouse.down(handle(kanji.url), yOf(0));
    mouse.up(yOf(0));
    expect(fireEvent.click(handle(kanji.url))).toBe(true);
    wait(400);
    expect(dragging()).toBe(false);
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("takes a quick tap for a tap: nothing lifts once the finger is gone", () => {
    renderScreen();
    const touch = pointer("touch");
    touch.down(handle(kanji.url), yOf(0));
    touch.up(yOf(0));
    expect(row(kanji.url)).not.toHaveClass("press-pending");
    wait(400);
    expect(dragging()).toBe(false);
    expect(fireEvent.click(handle(kanji.url))).toBe(true);
  });

  it("gives a press up when the finger moves before it lifts: that is a scroll", () => {
    renderScreen();
    const touch = pointer("touch");
    touch.down(handle(kanji.url), yOf(0));
    touch.move(yOf(0, 29));
    wait(400);
    expect(dragging()).toBe(false);
    expect(row(kanji.url)).not.toHaveClass("press-pending");
  });

  it("gives a press up for a second finger (a pinch), but not a drag already lifted", () => {
    renderScreen();
    const touch = pointer("touch");
    touch.down(handle(kanji.url), yOf(0));
    pointer("touch", 2).down(handle(kana.url), yOf(2));
    wait(400);
    expect(dragging()).toBe(false);
    lift(kanji.url, 0);
    pointer("touch", 2).down(handle(kana.url), yOf(2));
    pointer("touch", 2).move(yOf(4));
    pointer("touch", 2).up(yOf(4));
    expect(dragging()).toBe(true);
  });

  it.each<[string, () => Element, object]>([
    ["a button", () => screen.getByRole("button", { name: "Move Kanji N5" }), {}],
    ["the right button", () => handle(kanji.url), { button: 2 }],
    ["a second, later pointer", () => handle(kanji.url), { isPrimary: false }],
    ["what a group holds, between its rows", () => row(japanese).closest(".deck-group")!.querySelector(".deck-group-body")!, {}],
  ])("starts no drag on %s", (_, target, init) => {
    renderScreen();
    pointer("touch").down(target(), yOf(0), init);
    wait(400);
    expect(dragging()).toBe(false);
  });

  it("starts no drag on an empty group's hint", () => {
    renderScreen({ readOnly: false, children: [group("group-3", "Other", [])] });
    pointer("touch").down(document.querySelector(".deck-group-empty")!, yOf(1));
    wait(400);
    expect(dragging()).toBe(false);
  });

  it("starts no drag on a list arranged by a newer version, nor while a group is being named", () => {
    const { unmount } = renderScreen({ ...tree, readOnly: true });
    pointer("touch").down(handle(kanji.url), yOf(0));
    wait(400);
    expect(dragging()).toBe(false);
    unmount();
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Rename group Japanese" }));
    pointer("touch").down(handle(kanji.url), yOf(0));
    wait(400);
    expect(dragging()).toBe(false);
  });

  it("drags a group by its header, with what it holds, its copy saying how many decks", () => {
    const { onEdit, onToggle } = renderScreen();
    const touch = lift(japanese, 1);
    expect(row(japanese).closest(".deck-group")).toHaveClass("drag-source");
    expect(ghost()).toHaveTextContent("Japanese2 decks");
    // Under the list's last row: in Other, then 20px further, after it.
    touch.move(yOf(6, 52));
    expect(line().dataset.label).toBe("in Other");
    touch.move(yOf(6, 62));
    expect(line().dataset.label).toBe("after Other");
    expect(line().style.getPropertyValue("--line-depth")).toBe("0");
    touch.up(yOf(6, 62));
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: japanese, to: { parent: null, after: other } });
    // Its fold button's click, the drop's own, does not fold it.
    fireEvent.click(handle(japanese));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("drops nothing on the row's own place, and draws no line there", () => {
    const { onEdit } = renderScreen();
    const touch = lift(kanji.url, 0);
    touch.move(yOf(0, 30));
    expect(line().hidden).toBe(true);
    touch.up(yOf(0, 30));
    expect(onEdit).not.toHaveBeenCalled();
    expect(statusTexts()).toEqual([]);
    expect(dragging()).toBe(false);
  });

  it("makes a new group of two once the pointer stays on the other row, and opens its name", () => {
    const { onEdit } = renderScreen(flat);
    const touch = lift(kana.url, 1);
    // Above Kanji's middle: till the group is armed, first in the list.
    touch.move(yOf(0, 15));
    expect(line().hidden).toBe(false);
    expect(line().style.transform).toBe("translateY(-4px)");
    expect(line().dataset.label).toBeUndefined();
    wait(200);
    // Off and on again: the wait starts over.
    touch.move(yOf(0, 2));
    touch.move(yOf(0, 25));
    wait(200);
    expect(row(kanji.url)).not.toHaveClass("drop-combine");
    wait(100);
    expect(row(kanji.url)).toHaveClass("drop-combine");
    expect(line().hidden).toBe(true);
    const proxy = document.querySelector<HTMLInputElement>(".focus-proxy")!;
    const focus = vi.spyOn(proxy, "focus");
    touch.up(yOf(0, 25));
    expect(focus).toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalledWith({
      kind: "combine",
      dragged: kana.url,
      target: kanji.url,
      group: { url: fresh, title: { en: "New group" } },
    });
    expect(screen.getByRole("textbox", { name: "Group name" })).toHaveFocus();
    expect(statusTexts()).toEqual(['Put Kanji N5 and Kana in a new group. Name it, or press Escape to keep "New group".']);
  });

  it.each<[string, () => void]>([
    ["Escape", () => expect(fireEvent.keyDown(document.body, { key: "Escape" })).toBe(false)],
    ["the pointer's cancel", () => fireEvent.pointerCancel(window, { pointerId: 1 })],
    ["the pointer's capture lost", () => fireEvent(document.querySelector(".deck-tree")!, new Event("lostpointercapture"))],
    ["the window losing focus", () => fireEvent.blur(window)],
    [
      "the page being hidden",
      () => {
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        fireEvent(document, new Event("visibilitychange"));
        Reflect.deleteProperty(document, "visibilityState");
      },
    ],
  ])("gives a drag up on %s, and says so", (_, give) => {
    const { onEdit } = renderScreen();
    const touch = lift(kanji.url, 0);
    touch.move(yOf(2, 44));
    give();
    expect(dragging()).toBe(false);
    expect(ghost()).toBeNull();
    expect(line().hidden).toBe(true);
    expect(statusTexts()).toEqual(["Move cancelled: the deck or group stays where it was."]);
    touch.up(yOf(2, 44));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("keeps a drag on other keys, the page shown, other pointers' ends, and a row's capture lost", () => {
    renderScreen();
    lift(kanji.url, 0);
    fireEvent(handle(kanji.url), new Event("lostpointercapture", { bubbles: true }));
    fireEvent.keyDown(document.body, { key: "a" });
    fireEvent(document, new Event("visibilitychange"));
    fireEvent.pointerCancel(window, { pointerId: 2 });
    pointer("touch", 2).up(yOf(0));
    expect(dragging()).toBe(true);
  });

  it("gives a press up quietly on Escape before it lifts", () => {
    renderScreen();
    pointer("touch").down(handle(kanji.url), yOf(0));
    fireEvent.keyDown(document.body, { key: "Escape" });
    wait(400);
    expect(dragging()).toBe(false);
    expect(statusTexts()).toEqual([]);
  });

  it("keeps the page from scrolling under a lifted row, and no longer", () => {
    renderScreen();
    const list = document.querySelector(".deck-tree")!;
    expect(fireEvent.touchMove(list)).toBe(true);
    const touch = lift(kanji.url, 0);
    expect(fireEvent.touchMove(list)).toBe(false);
    touch.up(yOf(0));
    expect(fireEvent.touchMove(list)).toBe(true);
  });

  it("keeps a held row's menu and the browser's own drag away", () => {
    renderScreen();
    expect(fireEvent.contextMenu(handle(kanji.url))).toBe(true);
    pointer("touch").down(handle(kanji.url), yOf(0));
    expect(fireEvent.contextMenu(handle(kanji.url))).toBe(false);
    const drag = new Event("dragstart", { bubbles: true, cancelable: true });
    handle(kanji.url).dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(true);
  });

  it("scrolls by itself near the viewport's top and bottom, faster nearer the edge", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => frames.push(frame));
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const step = () => frames.shift()!(0);
    renderScreen();
    const touch = lift(kanji.url, 0);
    expect(frames).toHaveLength(0);
    touch.move(28);
    touch.move(0);
    expect(frames).toHaveLength(1);
    step();
    expect(scrollBy).toHaveBeenCalledWith(0, -18);
    expect(frames).toHaveLength(1);
    touch.move(400);
    step();
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(frames).toHaveLength(0);
    touch.move(window.innerHeight);
    expect(frames).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    // A frame asked for before the drag ended does nothing.
    step();
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("aims again as the page scrolls or resizes under the pointer", () => {
    renderScreen();
    const touch = lift(kanji.url, 0);
    touch.move(yOf(2, 44));
    expect(line().style.transform).toBe("translateY(140px)");
    // The list 96px higher: the pointer is two rows further down it, between Verbs and Other, the
    // middle of the three places there.
    listTop = 4;
    fireEvent.scroll(window);
    expect(line().style.transform).toBe("translateY(236px)");
    expect(line().dataset.label).toBe("after Grammar");
    fireEvent(window, new Event("resize"));
    touch.up(yOf(2, 44));
    expect(dragging()).toBe(false);
  });

  it("drags on when the pointer cannot be captured", () => {
    vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {
      throw new DOMException("No active pointer", "NotFoundError");
    });
    const { onEdit } = renderScreen();
    const touch = lift(kanji.url, 0);
    touch.move(yOf(2, 44));
    touch.up(yOf(2, 44));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("lets go of everything when the list goes mid-drag", () => {
    const { unmount } = renderScreen();
    lift(kanji.url, 0);
    unmount();
    expect(dragging()).toBe(false);
  });
});

describe("DeckListScreen dragging while the list changes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const shown = [...document.querySelectorAll("[data-row-key]")];
      const index = shown.indexOf(this);
      return index === -1 ? new DOMRect() : new DOMRect(0, index * 48, 500, 40);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderList(initial: DeckTree) {
    const onEdit = vi.fn(async () => true);
    const props = (shown: DeckTree): Props => ({
      tree: shown,
      collapsed: new Set(),
      onToggle: () => undefined,
      onUnfold: () => undefined,
      onEdit,
      newGroup: (title) => ({ url: fresh, title }),
      error: null,
      libraryHref: "#/library?instance=a",
      deckHref: (d) => `#/deck?deck=${d.id}`,
      renderStudyAction: () => null,
      createDeckHref: "#/new-deck?instance=a",
    });
    const view = render(<DeckListScreen {...props(initial)} />);
    return { onEdit, change: (next: DeckTree) => view.rerender(<DeckListScreen {...props(next)} />) };
  }

  const titles = () => screen.getAllByRole("link").map((link) => link.textContent).slice(0, -2);

  /** Lifts the row at `index` with a long press, and moves to `y`. */
  function liftTo(index: number, y: number) {
    const at = (clientY: number) => ({ pointerId: 1, pointerType: "touch", clientX: 5, clientY, button: 0, isPrimary: true });
    fireEvent.pointerDown(document.querySelectorAll(".deck-open")[index]!, at(index * 48 + 20));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerMove(window, at(y));
    return () => fireEvent.pointerUp(window, at(y));
  }

  const three: DeckTree = { readOnly: false, children: [deck(kanji), deck(kana), deck(verbs)] };

  it("shows the list as it was lifted till the drop, then makes the drop on the list as it is", () => {
    const { onEdit, change } = renderList(three);
    // Kanji, under Kana.
    const drop = liftTo(0, 92);
    change({ readOnly: false, children: [deck(verbs), deck(kanji), deck(kana), deck(nouns)] });
    expect(titles()).toEqual(["Kanji N5", "Kana", "Verbs"]);
    drop();
    expect(onEdit).toHaveBeenCalledWith({ kind: "move", node: kanji.url, to: { parent: null, after: kana.url } });
    expect(titles()).toEqual(["Verbs", "Kanji N5", "Kana", "Nouns"]);
  });

  it("slides the rows once the drop's edit shows, though the list changed under the drag", () => {
    const { onEdit, change } = renderList(three);
    const drop = liftTo(0, 92);
    // Written back as it was (a drop before this one's write done, say).
    const again: DeckTree = { ...three, children: [...three.children] };
    change(again);
    drop();
    // The edit is on its way: nothing has moved yet.
    expect(row(kana.url).style.transition).toBe("");
    const moved = { kind: "move", node: kanji.url, to: { parent: null, after: kana.url } } as const;
    expect(onEdit).toHaveBeenCalledWith(moved);
    change(applyDeckTreeEdit(again, moved));
    expect(titles()).toEqual(["Kana", "Kanji N5", "Verbs"]);
    expect(row(kana.url).style.transition).toBe("transform 220ms cubic-bezier(0.2, 0.8, 0.3, 1)");
  });

  it("drops nothing, quietly, when the list already is as the drop would make it", () => {
    const { onEdit, change } = renderList(three);
    const drop = liftTo(0, 92);
    change({ readOnly: false, children: [deck(kana), deck(kanji), deck(verbs)] });
    drop();
    expect(onEdit).not.toHaveBeenCalled();
    expect(statusTexts()).toEqual([]);
  });

  it("lifts nothing, quietly, when the deck pressed goes while it is held", () => {
    const { onEdit, change } = renderList(three);
    const at = (clientY: number) => ({ pointerId: 1, pointerType: "touch", clientX: 5, clientY, button: 0, isPrimary: true });
    fireEvent.pointerDown(document.querySelectorAll(".deck-open")[0]!, at(20));
    change({ readOnly: false, children: [deck(kana), deck(verbs)] });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(document.documentElement.classList.contains("drag-active")).toBe(false);
    expect(document.querySelector(".drag-ghost")).toBeNull();
    fireEvent.pointerMove(window, at(92));
    fireEvent.pointerUp(window, at(92));
    expect(onEdit).not.toHaveBeenCalled();
    expect(statusTexts()).toEqual([]);
    expect(titles()).toEqual(["Kana", "Verbs"]);
  });

  it("gives the drop up, and says so, when the deck dragged is gone", () => {
    const { onEdit, change } = renderList(three);
    const drop = liftTo(0, 92);
    change({ readOnly: false, children: [deck(kana), deck(verbs)] });
    drop();
    expect(onEdit).not.toHaveBeenCalled();
    expect(statusTexts()).toEqual(["Move cancelled: the deck or group stays where it was."]);
  });

  it("gives a new group up, and says so, when the other deck is gone", () => {
    const { onEdit, change } = renderList(three);
    // Kanji onto Kana's middle, held there.
    const drop = liftTo(0, 73);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    change({ readOnly: false, children: [deck(kanji), deck(verbs)] });
    drop();
    expect(onEdit).not.toHaveBeenCalled();
    expect(statusTexts()).toEqual(["Move cancelled: the deck or group stays where it was."]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
