// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DRAFT_URL, instanceA, instanceB, makeCard, makeDeck } from "../../test/fixtures";
import { studioRouteToHash, type StudioRoute } from "../router";
import type { ScreenCommand } from "./commandIndex";
import { CommandPalette } from "./CommandPalette";
import { recentCommands, rememberCommand, type WorkItem } from "./prefs";
import { deckTabs } from "./workspaceLayout";
import { queryKeys } from "../queryKeys";

const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const verbs = makeDeck("deck-2", { en: "Verbs" });
const water = makeCard(kanji, "water");
const cardsRoute: StudioRoute = { screen: "cards", deckUrl: kanji.url };

/** A cache with what the workspace would have read on a deck's cards: the decks, the drafts and the deck's cards. */
function readCache() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["decks", instanceA.url], [kanji, verbs]);
  queryClient.setQueryData(["cards", kanji.cardsDocumentUrl], [water]);
  queryClient.setQueryData(queryKeys.releaseDrafts(instanceA.url), []);
  return queryClient;
}

function renderPalette(
  props: {
    route?: StudioRoute | null;
    queryClient?: QueryClient;
    commands?: ScreenCommand[];
    pinned?: WorkItem[];
  } = {},
) {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const route = props.route === undefined ? cardsRoute : props.route;
  const { unmount } = render(
    <QueryClientProvider client={props.queryClient ?? readCache()}>
      <CommandPalette
        route={route}
        instances={[instanceA, instanceB]}
        tabs={route?.screen === "cards" ? deckTabs(route, route.deckUrl) : []}
        commands={
          props.commands ?? [
            { id: "help", label: "Show the keyboard shortcuts", keys: "?", run: () => undefined },
          ]
        }
        pinned={props.pinned ?? []}
        onChoose={onChoose}
        onClose={onClose}
      />
    </QueryClientProvider>,
  );
  return { onChoose, onClose, unmount };
}

const field = () =>
  screen.getByRole("combobox", { name: "Search decks, drafts, cards and commands" });
const list = () => screen.getByRole("listbox");
const type = (text: string) => fireEvent.input(field(), { target: { value: text } });
const press = (key: string) => fireEvent.keyDown(field(), { key });
/** The list's groups, by their headings. */
const headings = () =>
  within(list())
    .getAllByRole("group")
    .map((group) => document.getElementById(group.getAttribute("aria-labelledby")!)!.textContent);
const picked = () => document.getElementById(field().getAttribute("aria-activedescendant")!)!;

describe("CommandPalette", () => {
  beforeEach(() => localStorage.clear());

  it("opens as a dialog with the focus in its field, a combobox over the list", () => {
    renderPalette();
    expect(screen.getByRole("dialog", { name: "Quick open" })).toHaveAttribute("open");
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute("aria-controls", list().id);
    expect(field()).toHaveAttribute("aria-expanded", "true");
    expect(field()).toHaveAttribute("aria-autocomplete", "list");
    expect(field()).toHaveAttribute("placeholder", "Search or run…");
  });

  it("lists by group, under their headings, every entry but the cards, each with its keys, the first picked", () => {
    renderPalette();
    expect(headings()).toEqual(["Commands", "Tabs", "Sections", "Instances", "Decks"]);
    const decks = within(list()).getByRole("group", { name: "Decks" });
    expect(
      within(decks)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Kanji N5", "Verbs"]);
    expect(within(list()).getByRole("group", { name: "Sections" })).toHaveTextContent("Groupsg g");
    expect(
      within(list()).getByRole("option", { name: "Groups" }).querySelectorAll("kbd"),
    ).toHaveLength(2);
    expect(within(list()).queryByRole("group", { name: "Cards of this deck" })).toBeNull();
    expect(picked()).toHaveTextContent("Show the keyboard shortcuts");
    expect(picked()).toHaveAttribute("aria-selected", "true");
  });

  it("keeps what matches as the user types, the cards of the deck shown among them, and says when nothing does", () => {
    renderPalette();
    type("water");
    expect(within(list()).getByRole("group", { name: "Cards of this deck" })).toHaveTextContent(
      "water",
    );
    expect(within(list()).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("");
    type("zzz");
    expect(within(list()).queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("Nothing matches.");
    expect(field()).toHaveAttribute("aria-expanded", "false");
    expect(field()).not.toHaveAttribute("aria-activedescendant");
    // Nothing to pick or choose.
    press("ArrowDown");
    press("Enter");
  });

  it("picks the next entry with Down and the one before with Up, round from either end, in sight", () => {
    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    renderPalette();
    type("e");
    const options = within(list()).getAllByRole("option");
    press("ArrowDown");
    expect(picked()).toBe(options[1]);
    expect(options[0]).toHaveAttribute("aria-selected", "false");
    expect(scrolled).toHaveBeenLastCalledWith({ block: "nearest" });
    press("ArrowUp");
    press("ArrowUp");
    expect(picked()).toBe(options[options.length - 1]);
    press("ArrowDown");
    expect(picked()).toBe(options[0]);
    // Typing picks the first again.
    press("ArrowDown");
    type("ver");
    expect(picked()).toBe(within(list()).getAllByRole("option")[0]);
    // Other keys are the field's.
    expect(fireEvent.keyDown(field(), { key: "a" })).toBe(true);
  });

  it("chooses the entry picked with Enter, and remembers it as used last", () => {
    const { onChoose } = renderPalette();
    type("verbs");
    press("Enter");
    expect(onChoose).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Verbs", route: { screen: "cards", deckUrl: verbs.url } }),
    );
    expect(recentCommands()).toEqual([
      `decks:${studioRouteToHash({ screen: "cards", deckUrl: verbs.url })}`,
    ]);
  });

  it("leaves Enter and the arrows to an input method composing a letter", () => {
    const { onChoose } = renderPalette();
    const first = picked();
    fireEvent.keyDown(field(), { key: "ArrowDown", isComposing: true });
    expect(picked()).toBe(first);
    fireEvent.keyDown(field(), { key: "Enter", keyCode: 229 });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("picks an entry under the pointer, and chooses one clicked", () => {
    const { onChoose } = renderPalette();
    const verbsOption = within(list()).getByRole("option", { name: "Verbs" });
    fireEvent.mouseMove(verbsOption);
    expect(picked()).toBe(verbsOption);
    fireEvent.click(within(list()).getByRole("option", { name: "Show the keyboard shortcuts" }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ id: "command:help" }));
  });

  it("lists the entries used last first", () => {
    localStorage.setItem(
      "solid-memo:studioRecent.v1",
      JSON.stringify([`decks:${studioRouteToHash({ screen: "cards", deckUrl: verbs.url })}`]),
    );
    renderPalette();
    expect(within(list()).getAllByRole("group")[0]).toBe(
      within(list()).getByRole("group", { name: "Recently used" }),
    );
    expect(picked()).toHaveTextContent("Verbs");
  });

  it("lists the decks and drafts pinned first, then those used last but those pinned, with nothing typed", () => {
    rememberCommand(`decks:${studioRouteToHash({ screen: "cards", deckUrl: verbs.url })}`);
    rememberCommand(`decks:${studioRouteToHash(cardsRoute)}`);
    renderPalette({
      pinned: [
        { kind: "deck", url: verbs.url },
        { kind: "draft", url: DRAFT_URL },
      ],
    });
    expect(headings().slice(0, 2)).toEqual(["Pinned", "Recently used"]);
    expect(within(list()).getAllByRole("group")[0]).toHaveTextContent(/^PinnedVerbs$/);
    expect(within(list()).getAllByRole("group")[1]).toHaveTextContent(/^Recently usedKanji N5$/);
    expect(within(list()).queryByRole("group", { name: "Decks" })).toBeNull();
    type("verbs");
    expect(headings()).toEqual(["Decks"]);
  });

  it("closes on Escape", () => {
    const { onClose } = renderPalette();
    act(() => {
      press("Escape");
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Ctrl+K or Cmd+K again, from anywhere in it, rather than let the browser have the key", () => {
    const { onClose, unmount } = renderPalette();
    type("k");
    expect(fireEvent.keyDown(field(), { key: "k" })).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      expect(fireEvent.keyDown(field(), { key: "k", ctrlKey: true })).toBe(false);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    const again = renderPalette();
    act(() => {
      fireEvent.keyDown(screen.getByRole("button", { name: "Close" }), { key: "k", metaKey: true });
    });
    expect(again.onClose).toHaveBeenCalledTimes(1);
  });

  it("lists what the cache has: no decks, drafts or cards it has not read, and no instance's sections on the instances", () => {
    renderPalette({ queryClient: new QueryClient() });
    expect(within(list()).queryByRole("group", { name: "Decks" })).toBeNull();
    type("water");
    expect(within(list()).queryAllByRole("option")).toHaveLength(0);
  });
});

describe("CommandPalette, off a deck", () => {
  it("lists the instances and all of them, with no instance open, or none worked out", () => {
    for (const route of [{ screen: "instances" } as StudioRoute, null]) {
      const { unmount } = renderPalette({ route, commands: [] });
      expect(headings()).toEqual(["Sections", "Instances"]);
      expect(within(list()).getByRole("group", { name: "Sections" })).toHaveTextContent(
        /^SectionsAll instancesg i$/,
      );
      unmount();
    }
  });

  it("lists the drafts of the open instance, but no cards, on another screen of it", () => {
    const queryClient = readCache();
    queryClient.setQueryData(queryKeys.releaseDrafts(instanceA.url), [
      {
        url: DRAFT_URL,
        instanceUrl: instanceA.url,
        name: "solid",
        version: 1,
        readable: true,
        title: { en: "Solid" },
        course: true,
      },
    ]);
    renderPalette({ route: { screen: "groups", instanceUrl: instanceA.url }, queryClient });
    expect(within(list()).getByRole("group", { name: "Drafts" })).toHaveTextContent("Solid");
    type("water");
    expect(within(list()).queryAllByRole("option")).toHaveLength(0);
  });
});
