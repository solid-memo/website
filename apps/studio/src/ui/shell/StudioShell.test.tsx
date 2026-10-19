// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { useContext, useState } from "preact/hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ActionsMenu, MenuItem } from "@solid-memo/ui/ActionsMenu";
import { DRAFT_URL, instanceA } from "../../test/fixtures";
import { DraftWaiting, type EditorReport } from "../draftEditor";
import { studioRouteToHash, type StudioRoute } from "../router";
import type { ScreenCommand } from "./commandIndex";
import { useActivityLog } from "./activity";
import type { WorkspaceProblems } from "./BottomDock";
import { RevealAside } from "./revealAside";
import { StudioShell, type AsidePane } from "./StudioShell";
import { useScreenCommands } from "./useScreenCommands";
import { DataTable } from "./DataTable";
import { ASIDE_WIDTH, DETAIL_WIDTH, DOCK_HEIGHT } from "./splitter";
import type { ContextTab } from "./workspaceLayout";
import { narrowScreen, wideScreen } from "../../test/media";

/** Says what a draft editor would: how many of its changes wait. */
let report: (editor: object, report: EditorReport) => void;
function Editor() {
  report = useContext(DraftWaiting);
  return <p>An editor</p>;
}

/** Tells the Studio's activity what a screen did, as a screen's status line does. */
let logActivity: (text: string) => void;
function Activity() {
  logActivity = useActivityLog();
  return null;
}

/** A screen that asks for the aside to be seen, as the graph does as a node is selected. */
function Revealing() {
  const reveal = useContext(RevealAside);
  return (
    <button type="button" onClick={reveal}>
      Select a node
    </button>
  );
}

/** A screen with commands of its own in the palette. */
function Commands({ commands }: { commands: ScreenCommand[] }) {
  useScreenCommands(commands);
  return null;
}

const groups: StudioRoute = { screen: "groups", instanceUrl: instanceA.url };
const drafts: StudioRoute = { screen: "drafts", instanceUrl: instanceA.url };

function renderShell(
  props: {
    draftUrl?: string | null;
    queryClient?: QueryClient;
    onGo?: (route: StudioRoute) => void;
    noInstance?: true;
    filter?: true;
    tabs?: readonly ContextTab[];
    commands?: ScreenCommand[];
    aside?: AsidePane;
    problems?: WorkspaceProblems;
    table?: true;
    status?: true;
    revealing?: true;
  } = {},
) {
  const queryClient = props.queryClient ?? new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <StudioShell
        banner={<p>The masthead</p>}
        backHref="#/decks"
        route={props.noInstance ? { screen: "instances" } : groups}
        instances={[instanceA]}
        instance={props.noInstance ? null : instanceA}
        switcher={<button type="button">Deck set A</button>}
        sidebar={
          props.noInstance ? null : (
            <ul>
              <li>
                <a href={studioRouteToHash(groups)}>Groups</a>
              </li>
            </ul>
          )
        }
        tabs={props.tabs ?? []}
        draftUrl={props.draftUrl ?? null}
        aside={props.aside ?? null}
        problems={props.problems ?? null}
        pinned={[]}
        status={props.status && <a href="#/release">Ready to publish</a>}
        onGo={props.onGo ?? (() => undefined)}
      >
        <Editor />
        <Activity />
        {props.commands && <Commands commands={props.commands} />}
        {props.revealing && <Revealing />}
        {props.table && (
          <DataTable
            caption="Planets"
            rows={["Mars"]}
            keyOf={(planet) => planet}
            name={{ key: "name", label: "Planet", cell: (planet) => planet }}
            columns={[{ key: "moons", label: "Moons", cell: () => 2 }]}
            columnsOf="planets"
          />
        )}
        {props.filter && (
          <label>
            Filter
            <input type="search" aria-keyshortcuts="/" />
          </label>
        )}
      </StudioShell>
    </QueryClientProvider>,
  );
}

const statusBar = () => within(screen.getByRole("complementary", { name: "Studio status" }));
/** Presses a key where the focus is, and says whether the Studio took it (its own action stopped). */
const press = (key: string, init: KeyboardEventInit = {}) =>
  !fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
const root = document.documentElement;
/** The sidebar, by its button: hidden, it has no name to be found by. */
const sidebar = () => document.getElementById(toggle().getAttribute("aria-controls")!)!;
const toggle = () => screen.getByRole("button", { name: "Sidebar" });

describe("StudioShell", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "#/");
  });

  it("lays the page out as the Studio while it is shown, compact at first, and gives it back to Solid Memo after", async () => {
    const { unmount } = renderShell();
    expect(root.getAttribute("data-surface")).toBe("studio");
    expect(root.getAttribute("data-density")).toBe("compact");
    expect(screen.getByText("The masthead").closest("header")).toHaveClass("site-header");
    expect(screen.getByRole("link", { name: "Back to Solid Memo" })).toHaveAttribute(
      "href",
      "#/decks",
    );
    expect(within(screen.getByRole("main")).getByText("An editor")).toBeInTheDocument();
    unmount();
    await waitFor(() => expect(root.getAttribute("data-surface")).toBeNull());
    expect(root.getAttribute("data-density")).toBeNull();
  });

  it("keeps the columns a table hides on this device, without a history entry", () => {
    const length = window.history.length;
    const { unmount } = renderShell({ table: true });
    fireEvent.click(screen.getByRole("button", { name: "Show or hide columns" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Moons" }));
    expect(screen.queryByRole("columnheader", { name: "Moons" })).toBeNull();
    expect(window.history.length).toBe(length);
    unmount();
    renderShell({ table: true });
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Planet"]);
  });

  it("names the open instance in the status bar, and says nothing of a draft off a draft's screens", () => {
    renderShell();
    expect(statusBar().getByText(instanceA.name)).toBeInTheDocument();
    expect(statusBar().queryByText("Draft saved")).toBeNull();
  });

  it("says in the status bar what the screen adds, after whether the draft is saved", () => {
    renderShell({ draftUrl: DRAFT_URL, status: true });
    expect(
      statusBar().getByRole("link", { name: "Ready to publish" }).previousElementSibling,
    ).toHaveTextContent("Draft saved");
  });

  it("switches the density from the status bar, without a history entry, and keeps it on this device", () => {
    const length = window.history.length;
    const { unmount } = renderShell();
    const comfortable = statusBar().getByRole("button", { name: "Comfortable" });
    expect(statusBar().getByRole("button", { name: "Compact" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(comfortable).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(comfortable);
    expect(comfortable).toHaveAttribute("aria-pressed", "true");
    expect(root.getAttribute("data-density")).toBe("comfortable");
    expect(window.history.length).toBe(length);
    unmount();
    renderShell();
    expect(root.getAttribute("data-density")).toBe("comfortable");
  });

  it("says whether the draft's changes are saved: not while one waits or is being written", async () => {
    const queryClient = new QueryClient();
    renderShell({ draftUrl: DRAFT_URL, queryClient });
    expect(statusBar().getByText("Draft saved")).toBeInTheDocument();
    const one = {};
    const other = {};
    act(() => report(one, { waiting: 1, failed: false }));
    expect(statusBar().getByText("Saving the draft…")).toBeInTheDocument();
    act(() => report(other, { waiting: 2, failed: false }));
    act(() => report(one, { waiting: 0, failed: false }));
    expect(statusBar().getByText("Saving the draft…")).toBeInTheDocument();
    act(() => report(other, { waiting: 0, failed: false }));
    expect(statusBar().getByText("Draft saved")).toBeInTheDocument();

    let written!: () => void;
    const write = queryClient.getMutationCache().build(queryClient, {
      mutationKey: ["editReleaseDraft", DRAFT_URL],
      mutationFn: () => new Promise<void>((resolve) => (written = resolve)),
    });
    const done = write.execute(undefined);
    expect(await statusBar().findByText("Saving the draft…")).toBeInTheDocument();
    await act(async () => {
      written();
      await done;
    });
    expect(await statusBar().findByText("Draft saved")).toBeInTheDocument();
  });

  it("says when the last change of the draft failed, until the editor that made it says otherwise", () => {
    renderShell({ draftUrl: DRAFT_URL });
    const editor = {};
    act(() => report(editor, { waiting: 0, failed: true }));
    expect(statusBar().getByText("Last change not saved")).toBeInTheDocument();
    act(() => report(editor, { waiting: 1, failed: true }));
    expect(statusBar().getByText("Saving the draft…")).toBeInTheDocument();
    act(() => report(editor, { waiting: 0, failed: false }));
    expect(statusBar().getByText("Draft saved")).toBeInTheDocument();
  });

  it("shows every shortcut with ?, or from the status bar, and gives the focus back once closed", () => {
    renderShell();
    const button = statusBar().getByRole("button", { name: "? Keys" });
    expect(button).toHaveAttribute("aria-keyshortcuts", "?");
    document.body.focus();
    expect(press("?", { shiftKey: true })).toBe(true);
    const help = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(help).toHaveAttribute("open");
    expect(
      within(help).getByRole("heading", { name: "Anywhere in the Studio" }),
    ).toBeInTheDocument();
    expect(
      within(help).getByRole("heading", {
        name: "In a table: the cards, the decks, a draft's cards…",
      }),
    ).toBeInTheDocument();
    expect(within(help).getByText("Go to the decks").previousElementSibling).toHaveTextContent(
      "g d",
    );
    expect(
      within(help)
        .getByText("Go to the previous region")
        .previousElementSibling!.querySelectorAll("kbd"),
    ).toHaveLength(2);
    expect(within(help).getByText("Open the row")).toBeInTheDocument();
    // Ctrl+K and Cmd+K as one.
    expect(
      within(help).getByText("Search, go to or run a command").previousElementSibling,
    ).toHaveTextContent(/^Ctrl\+K$/);
    // The nine tabs' keys as one.
    expect(
      within(help).getByText("Go to a tab of the deck or draft by its number")
        .previousElementSibling,
    ).toHaveTextContent(/^1–9$/);
    expect(
      within(help).getAllByText("Go to a tab of the deck or draft by its number"),
    ).toHaveLength(1);
    // Its keys are its own: g d goes nowhere from it.
    within(help).getByRole("button", { name: "Close" }).focus();
    expect(press("g")).toBe(false);
    fireEvent.click(within(help).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    // Escape, as the browser closes it.
    act(() => {
      screen.getByRole("dialog").dispatchEvent(new Event("close"));
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("goes to the screen's filter with /, and leaves / alone on a screen without one", () => {
    const { unmount } = renderShell({ filter: true });
    document.body.focus();
    expect(press("/")).toBe(true);
    expect(screen.getByRole("searchbox", { name: "Filter" })).toHaveFocus();
    // Typed in the filter, it is the filter's.
    expect(press("/")).toBe(false);
    unmount();
    renderShell();
    document.body.focus();
    expect(press("/")).toBe(false);
  });

  it("moves between the regions with F6 and Shift+F6, the sidebar among them, from a field too", () => {
    renderShell({ filter: true });
    const header = screen.getByText("The masthead").closest("header")!;
    const main = screen.getByRole("main");
    const status = screen.getByRole("complementary", { name: "Studio status" });
    document.body.focus();
    press("F6");
    expect(header).toHaveFocus();
    press("F6");
    expect(sidebar()).toHaveFocus();
    press("F6");
    expect(main).toHaveFocus();
    press("F6");
    expect(status).toHaveFocus();
    press("F6");
    expect(header).toHaveFocus();
    press("F6", { shiftKey: true });
    expect(status).toHaveFocus();
    screen.getByRole("searchbox", { name: "Filter" }).focus();
    expect(press("F6", { shiftKey: true })).toBe(true);
    expect(sidebar()).toHaveFocus();
  });

  it("goes to a section with a g chord, as a link does, and to no section of an instance without one", () => {
    const onGo = vi.fn();
    const { unmount } = renderShell({ onGo });
    document.body.focus();
    expect(press("g")).toBe(false);
    expect(press("d")).toBe(true);
    expect(onGo).toHaveBeenLastCalledWith({ screen: "home", instanceUrl: instanceA.url });
    press("g");
    press("g");
    expect(onGo).toHaveBeenLastCalledWith({ screen: "groups", instanceUrl: instanceA.url });
    press("g");
    press("i");
    expect(onGo).toHaveBeenLastCalledWith({ screen: "instances" });
    // A g held down is not g g, and a chord to the page shown adds no Back stop.
    onGo.mockClear();
    press("g");
    press("g", { repeat: true });
    press("d");
    expect(onGo).toHaveBeenCalledWith({ screen: "home", instanceUrl: instanceA.url });
    onGo.mockClear();
    window.history.replaceState(
      null,
      "",
      studioRouteToHash({ screen: "groups", instanceUrl: instanceA.url }),
    );
    press("g");
    expect(press("g")).toBe(true);
    expect(onGo).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "#/");
    // Not while the user types.
    unmount();
    onGo.mockClear();
    renderShell({ onGo, noInstance: true, filter: true });
    screen.getByRole("searchbox", { name: "Filter" }).focus();
    press("g");
    press("i");
    expect(onGo).not.toHaveBeenCalled();
    document.body.focus();
    press("g");
    expect(press("r")).toBe(false);
    expect(onGo).not.toHaveBeenCalled();
    press("g");
    press("i");
    expect(onGo).toHaveBeenCalledWith({ screen: "instances" });
  });

  it("closes any dialog with Ctrl+K, and opens the palette in its place, rather than let the key reach the browser", () => {
    renderShell();
    const button = statusBar().getByRole("button", { name: "? Keys" });
    button.focus();
    fireEvent.click(button);
    within(screen.getByRole("dialog", { name: "Keyboard shortcuts" }))
      .getByRole("button", { name: "Close" })
      .focus();
    expect(press("k", { ctrlKey: true })).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Keyboard shortcuts" })).toBeNull();
    const palette = screen.getByRole("dialog", { name: "Quick open" });
    expect(within(palette).getByRole("combobox")).toHaveFocus();
    // Closed, the palette gives the focus back where it was before the key help.
    fireEvent.click(within(palette).getByRole("button", { name: "Close" }));
    expect(button).toHaveFocus();
  });

  it("leaves the keys to a dialog open while the focus is on the page's body, but Ctrl+K", () => {
    renderShell({ filter: true });
    fireEvent.click(statusBar().getByRole("button", { name: "? Keys" }));
    // A press on the dialog's text leaves the focus on the page's body.
    document.body.focus();
    expect(press("?", { shiftKey: true })).toBe(false);
    expect(press("/")).toBe(false);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(press("k", { ctrlKey: true })).toBe(true);
    expect(screen.getByRole("dialog", { name: "Quick open" })).toBeInTheDocument();
  });

  it("turns single-key shortcuts off, and on, from the key help, as the device remembers, keys with Ctrl working still", () => {
    const { unmount } = renderShell({ filter: true, table: true });
    fireEvent.click(statusBar().getByRole("button", { name: "? Keys" }));
    const setting = within(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).getByRole(
      "checkbox",
      { name: "Single-key shortcuts" },
    );
    expect(setting).toBeChecked();
    fireEvent.click(setting);
    expect(setting).not.toBeChecked();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    unmount();
    renderShell({ filter: true, table: true });
    document.body.focus();
    expect(press("?", { shiftKey: true })).toBe(false);
    expect(press("/")).toBe(false);
    expect(press("j")).toBe(false);
    expect(press("b", { ctrlKey: true })).toBe(true);
    fireEvent.click(statusBar().getByRole("button", { name: "? Keys" }));
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("checkbox", { name: "Single-key shortcuts" }),
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    document.body.focus();
    expect(press("/")).toBe(true);
  });

  it("leaves the keys to a menu while one is open", () => {
    renderShell({ table: true });
    fireEvent.click(screen.getByRole("button", { name: "Show or hide columns" }));
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(press("?")).toBe(false);
    expect(press("k", { ctrlKey: true })).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves a key that what has the focus took", () => {
    renderShell();
    const header = screen.getByText("The masthead").closest("header")!;
    header.addEventListener("keydown", (event) => event.preventDefault());
    header.focus();
    press("?");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("passes over the sidebar with F6 while it is hidden", () => {
    renderShell();
    fireEvent.click(toggle());
    screen.getByText("The masthead").closest("header")!.focus();
    press("F6");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("shows the sidebar beside the page, and hides it from its button or with Ctrl+B, as the device remembers, without a history entry", () => {
    const length = window.history.length;
    const { unmount } = renderShell();
    expect(sidebar()).toBe(screen.getByRole("navigation", { name: "Studio" }));
    expect(within(sidebar()).getByRole("link", { name: "Groups" })).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAttribute("aria-keyshortcuts", "Control+B");
    fireEvent.click(toggle());
    expect(sidebar()).not.toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    document.body.focus();
    expect(press("b", { ctrlKey: true })).toBe(true);
    expect(sidebar()).toBeVisible();
    press("b", { ctrlKey: true });
    expect(window.history.length).toBe(length);
    unmount();
    renderShell();
    expect(sidebar()).not.toBeVisible();
    // A link in it leaves it as it is.
    fireEvent.click(toggle());
    fireEvent.click(within(sidebar()).getByRole("link", { name: "Groups" }));
    fireEvent.keyDown(sidebar(), { key: "Escape" });
    expect(sidebar()).toBeVisible();
  });

  it("gives the focus in the sidebar, as Ctrl+B hides it, to its button, beside the page or as a drawer", () => {
    const { unmount } = renderShell();
    within(sidebar()).getByRole("link", { name: "Groups" }).focus();
    press("b", { ctrlKey: true });
    expect(sidebar()).not.toBeVisible();
    expect(toggle()).toHaveFocus();
    // Elsewhere, the focus stays where it is.
    press("b", { ctrlKey: true });
    screen.getByRole("main").focus();
    press("b", { ctrlKey: true });
    expect(screen.getByRole("main")).toHaveFocus();
    unmount();
    vi.restoreAllMocks();
    narrowScreen();
    renderShell();
    fireEvent.click(toggle());
    within(sidebar()).getByRole("link", { name: "Groups" }).focus();
    press("b", { ctrlKey: true });
    expect(sidebar()).not.toBeVisible();
    expect(toggle()).toHaveFocus();
  });

  it("has no sidebar, nor its button, without an instance open, and leaves Ctrl+B alone", () => {
    renderShell({ noInstance: true });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sidebar" })).toBeNull();
    document.body.focus();
    expect(press("b", { ctrlKey: true })).toBe(false);
  });

  it("shows the open instance in the header, to switch from", () => {
    renderShell();
    expect(
      within(screen.getByText("The masthead").closest("header")!).getByRole("button", {
        name: "Deck set A",
      }),
    ).toBeInTheDocument();
  });

  it("makes the sidebar a drawer on a narrow screen: closed at first, open with the focus in it, closed by a link, a press outside or Escape", () => {
    const screenSize = narrowScreen();
    renderShell();
    expect(sidebar()).not.toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle());
    expect(sidebar()).toBeVisible();
    expect(sidebar()).toHaveFocus();
    fireEvent.click(within(sidebar()).getByRole("link", { name: "Groups" }));
    expect(sidebar()).not.toBeVisible();
    document.body.focus();
    press("b", { ctrlKey: true });
    expect(sidebar()).toBeVisible();
    fireEvent.keyDown(sidebar(), { key: "Enter" });
    expect(sidebar()).toBeVisible();
    fireEvent.keyDown(sidebar(), { key: "Escape" });
    expect(sidebar()).not.toBeVisible();
    expect(toggle()).toHaveFocus();
    // A click elsewhere in it leaves it open; a press outside it closes it.
    fireEvent.click(toggle());
    fireEvent.pointerDown(sidebar());
    fireEvent.click(sidebar());
    expect(sidebar()).toBeVisible();
    fireEvent.pointerDown(screen.getByRole("main"));
    expect(sidebar()).not.toBeVisible();
    fireEvent.pointerDown(toggle());
    fireEvent.click(toggle());
    expect(sidebar()).toBeVisible();
    // Widened, the sidebar is beside the page again, as the device remembers it.
    screenSize.widen();
    expect(sidebar()).toBeVisible();
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("goes to the next tab or the one before with ] and [, and to one by its number, as a link does", () => {
    const onGo = vi.fn();
    const tabs: ContextTab[] = [
      { key: "groups", route: groups, current: "page" },
      { key: "drafts", route: drafts, current: false },
    ];
    window.history.replaceState(null, "", studioRouteToHash(groups));
    const { unmount } = renderShell({ onGo, tabs });
    document.body.focus();
    expect(press("]")).toBe(true);
    expect(onGo).toHaveBeenLastCalledWith(drafts);
    expect(press("[")).toBe(true);
    expect(onGo).toHaveBeenLastCalledWith(drafts);
    expect(press("2")).toBe(true);
    expect(onGo).toHaveBeenCalledTimes(3);
    // The tab shown adds no Back stop; a tab it does not have is no key of its.
    onGo.mockClear();
    expect(press("1")).toBe(true);
    expect(press("3")).toBe(false);
    expect(onGo).not.toHaveBeenCalled();
    unmount();
    renderShell({ onGo });
    document.body.focus();
    expect(press("]")).toBe(false);
    expect(press("1")).toBe(false);
  });
  it("opens the palette with Ctrl+K or Cmd+K, from a field too, or from its button, and goes where an entry does, as a link does", () => {
    const onGo = vi.fn();
    renderShell({ onGo, filter: true });
    const button = screen.getByRole("button", { name: "Search or run…" });
    expect(button).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K");
    screen.getByRole("searchbox", { name: "Filter" }).focus();
    expect(press("k", { ctrlKey: true })).toBe(true);
    const palette = screen.getByRole("dialog", { name: "Quick open" });
    expect(within(palette).getByRole("combobox")).toHaveFocus();
    fireEvent.click(within(palette).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    document.body.focus();
    expect(press("k", { metaKey: true })).toBe(true);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("option", { name: "Drafts" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onGo).toHaveBeenCalledWith(drafts);
    fireEvent.click(button);
    expect(screen.getByRole("dialog", { name: "Quick open" })).toBeInTheDocument();
  });

  it("lists the screen's commands and the shell's in the palette, and does one once the palette has closed and given the focus back", () => {
    const run = vi.fn(() => expect(screen.queryByRole("dialog")).toBeNull());
    renderShell({ commands: [{ id: "checkAgain", label: "Check again", run }] });
    const button = screen.getByRole("button", { name: "Search or run…" });
    const choose = (name: string) => {
      button.focus();
      fireEvent.click(button);
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Quick open" })).getByRole("option", { name }),
      );
    };
    choose("Check again");
    expect(run).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus();
    choose("Show or hide the sidebar");
    expect(sidebar()).not.toBeVisible();
    choose("Show the keyboard shortcuts");
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
  });

  it("offers no sidebar in the palette without one", () => {
    renderShell({ noInstance: true });
    fireEvent.click(screen.getByRole("button", { name: "Search or run…" }));
    expect(
      within(screen.getByRole("dialog")).queryByRole("option", {
        name: "Show or hide the sidebar",
      }),
    ).toBeNull();
    expect(
      within(screen.getByRole("dialog")).getByRole("option", {
        name: "Show the keyboard shortcuts",
      }),
    ).toBeInTheDocument();
  });

  describe("the aside", () => {
    beforeEach(wideScreen);
    const aside: AsidePane = {
      label: "Outline",
      content: (
        <ul>
          <li>
            <a href={studioRouteToHash(drafts)}>Step 1.1</a>
          </li>
        </ul>
      ),
    };
    const pane = () => document.getElementById(asideToggle().getAttribute("aria-controls")!)!;
    const asideToggle = () =>
      within(screen.getByText("The masthead").closest("header")!).getByRole("button", {
        name: "Outline",
      });

    it("shows what the route has there beside the main content, a complementary region named for it, and hides it from its buttons or with Ctrl+\\, as the device remembers", () => {
      const length = window.history.length;
      const { unmount } = renderShell({ aside });
      expect(pane()).toBe(screen.getByRole("complementary", { name: "Outline" }));
      expect(within(pane()).getByRole("link", { name: "Step 1.1" })).toBeInTheDocument();
      expect(asideToggle()).toHaveAttribute("aria-expanded", "true");
      expect(asideToggle()).toHaveAttribute("aria-keyshortcuts", "Control+\\");
      expect(root).toHaveAttribute("data-aside");
      expect(pane()).toHaveStyle({ width: `${ASIDE_WIDTH.initial}px` });
      fireEvent.click(within(pane()).getByRole("button", { name: "Hide" }));
      expect(pane()).not.toBeVisible();
      expect(asideToggle()).toHaveFocus();
      expect(root).not.toHaveAttribute("data-aside");
      document.body.focus();
      expect(press("\\", { ctrlKey: true })).toBe(true);
      expect(pane()).toBeVisible();
      fireEvent.click(asideToggle());
      expect(pane()).not.toBeVisible();
      expect(window.history.length).toBe(length);
      unmount();
      expect(root).not.toHaveAttribute("data-aside");
      renderShell({ aside });
      expect(pane()).not.toBeVisible();
    });

    it("gives the focus in it, as Ctrl+\\ hides it, to the header's button", () => {
      renderShell({ aside });
      within(pane()).getByRole("link", { name: "Step 1.1" }).focus();
      press("\\", { ctrlKey: true });
      expect(pane()).not.toBeVisible();
      expect(asideToggle()).toHaveFocus();
    });

    it("is as wide as its splitter makes it, which the device remembers", () => {
      const { unmount } = renderShell({ aside });
      const splitter = within(pane()).getByRole("separator", { name: "Width of the side pane" });
      fireEvent.keyDown(splitter, { key: "End" });
      expect(pane()).toHaveStyle({ width: `${ASIDE_WIDTH.max}px` });
      unmount();
      renderShell({ aside });
      expect(within(pane()).getByRole("separator")).toHaveAttribute(
        "aria-valuenow",
        String(ASIDE_WIDTH.max),
      );
    });

    it("is passed over by F6 while it is hidden, and has no button or key without a pane to show", () => {
      const { unmount } = renderShell({ aside });
      screen.getByRole("main").focus();
      press("F6");
      expect(pane()).toHaveFocus();
      fireEvent.click(asideToggle());
      screen.getByRole("main").focus();
      press("F6");
      expect(screen.getByRole("complementary", { name: "Studio status" })).toHaveFocus();
      unmount();
      renderShell();
      expect(screen.queryByRole("button", { name: "Outline" })).toBeNull();
      document.body.focus();
      expect(press("\\", { ctrlKey: true })).toBe(false);
      expect(root).not.toHaveAttribute("data-aside");
    });

    it("is a drawer at the page's right on a screen not wide: closed at first, open with the focus in it, closed by a link, a press outside, Escape or Hide", () => {
      vi.restoreAllMocks();
      narrowScreen(true);
      renderShell({ aside });
      expect(pane()).not.toBeVisible();
      expect(root).not.toHaveAttribute("data-aside");
      document.body.focus();
      press("\\", { ctrlKey: true });
      expect(pane()).toBeVisible();
      expect(pane()).toHaveFocus();
      // A drawer has no width to set: it is the screen's.
      expect(within(pane()).queryByRole("separator")).toBeNull();
      expect(root).not.toHaveAttribute("data-aside");
      fireEvent.click(within(pane()).getByRole("link", { name: "Step 1.1" }));
      expect(pane()).not.toBeVisible();
      fireEvent.click(asideToggle());
      fireEvent.click(pane());
      fireEvent.keyDown(pane(), { key: "Enter" });
      expect(pane()).toBeVisible();
      fireEvent.keyDown(pane(), { key: "Escape" });
      expect(pane()).not.toBeVisible();
      expect(asideToggle()).toHaveFocus();
      fireEvent.click(asideToggle());
      fireEvent.pointerDown(screen.getByRole("main"));
      expect(pane()).not.toBeVisible();
      fireEvent.click(asideToggle());
      fireEvent.click(within(pane()).getByRole("button", { name: "Hide" }));
      expect(pane()).not.toBeVisible();
    });

    it("opens as a drawer, with the focus in it, when the screen asks for it to be seen; beside the page, stays as the user chose", () => {
      vi.restoreAllMocks();
      const { widen } = narrowScreen(true);
      renderShell({ aside, revealing: true });
      expect(pane()).not.toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Select a node" }));
      expect(pane()).toBeVisible();
      expect(pane()).toHaveFocus();
      fireEvent.click(within(pane()).getByRole("button", { name: "Hide" }));
      widen();
      fireEvent.click(asideToggle());
      expect(pane()).not.toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Select a node" }));
      expect(pane()).not.toBeVisible();
    });

    it("stays open as a drawer while Escape closes a dialog in it", () => {
      vi.restoreAllMocks();
      narrowScreen(true);
      renderShell({
        aside: {
          label: "Outline",
          content: (
            <dialog open>
              <button type="button">Keep the step</button>
            </dialog>
          ),
        },
      });
      fireEvent.click(asideToggle());
      fireEvent.keyDown(screen.getByRole("button", { name: "Keep the step" }), { key: "Escape" });
      expect(pane()).toBeVisible();
    });

    it("stays open as a drawer while a menu of it, laid over the page, is used", () => {
      vi.restoreAllMocks();
      narrowScreen(true);
      const onSelect = vi.fn();
      function Menu() {
        const [open, setOpen] = useState(false);
        return (
          <ActionsMenu
            label="Actions for Step 1.1"
            buttonClass=""
            open={open}
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
          >
            <MenuItem onSelect={onSelect}>Move down</MenuItem>
          </ActionsMenu>
        );
      }
      renderShell({ aside: { label: "Outline", content: <Menu /> } });
      fireEvent.click(asideToggle());
      fireEvent.click(within(pane()).getByRole("button", { name: "Actions for Step 1.1" }));
      const item = screen.getByRole("menuitem", { name: "Move down" });
      expect(pane()).not.toContainElement(item);
      fireEvent.pointerDown(item);
      fireEvent.click(item);
      expect(onSelect).toHaveBeenCalled();
      expect(pane()).toBeVisible();
    });

    it("shows a detail of the main content while the route has it, as wide as its own splitter makes it, closed by going to the main content alone", () => {
      const onClose = vi.fn();
      localStorage.setItem("solid-memo:studioLayout.v1", JSON.stringify({ aside: false }));
      const { unmount } = renderShell({
        aside: {
          label: "Card",
          content: <p>The card</p>,
          detail: { closeLabel: "Close the card", onClose },
        },
      });
      const detail = screen.getByRole("complementary", { name: "Card" });
      // Shown though the outline would be hidden, and with no button to show or hide it.
      expect(detail).toBeVisible();
      expect(
        within(screen.getByText("The masthead").closest("header")!).queryByRole("button", {
          name: "Card",
        }),
      ).toBeNull();
      expect(root).toHaveAttribute("data-aside");
      expect(detail).toHaveStyle({ width: `${DETAIL_WIDTH.initial}px` });
      fireEvent.keyDown(within(detail).getByRole("separator", { name: "Width of the side pane" }), {
        key: "Home",
      });
      expect(detail).toHaveStyle({ width: `${DETAIL_WIDTH.min}px` });
      const close = within(detail).getByRole("button", { name: "Close" });
      expect(close).toHaveAttribute("aria-keyshortcuts", "Control+\\");
      fireEvent.click(close);
      document.body.focus();
      expect(press("\\", { ctrlKey: true })).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Search or run…" }));
      fireEvent.click(
        within(screen.getByRole("dialog", { name: "Quick open" })).getByRole("option", {
          name: "Close the card",
        }),
      );
      expect(onClose).toHaveBeenCalledTimes(3);
      unmount();
      // The outline keeps its own width.
      renderShell({
        aside: {
          label: "Card",
          content: <p>The card</p>,
          detail: { closeLabel: "Close the card", onClose },
        },
      });
      expect(screen.getByRole("complementary", { name: "Card" })).toHaveStyle({
        width: `${DETAIL_WIDTH.min}px`,
      });
      expect(JSON.parse(localStorage.getItem("solid-memo:studioLayout.v1")!)).toMatchObject({
        asideWidth: ASIDE_WIDTH.initial,
      });
    });

    it("leaves Escape and links in it alone beside the page", () => {
      renderShell({ aside });
      fireEvent.click(within(pane()).getByRole("link", { name: "Step 1.1" }));
      fireEvent.keyDown(pane(), { key: "Escape" });
      expect(pane()).toBeVisible();
    });
  });

  describe("the dock", () => {
    const dock = () => screen.getByRole("region", { name: "Panel" });
    const dockButton = () => statusBar().getByRole("button", { name: "Panel" });
    const problems: WorkspaceProblems = {
      count: 3,
      routes: [groups, drafts, drafts],
      list: <p>The problems</p>,
    };

    it("is hidden at first, and shown from the status bar or with Ctrl+J, as the device remembers, without a history entry", () => {
      const length = window.history.length;
      const { unmount } = renderShell();
      expect(screen.queryByRole("region", { name: "Panel" })).toBeNull();
      expect(dockButton()).toHaveAttribute("aria-expanded", "false");
      // No dock to control while it is hidden.
      expect(dockButton()).not.toHaveAttribute("aria-controls");
      expect(dockButton()).toHaveAttribute("aria-keyshortcuts", "Control+J");
      fireEvent.click(dockButton());
      expect(dock()).toHaveAttribute("id", dockButton().getAttribute("aria-controls"));
      expect(dockButton()).toHaveAttribute("aria-expanded", "true");
      document.body.focus();
      expect(press("j", { ctrlKey: true })).toBe(true);
      expect(screen.queryByRole("region", { name: "Panel" })).toBeNull();
      press("j", { ctrlKey: true });
      expect(window.history.length).toBe(length);
      unmount();
      renderShell();
      expect(dock()).toBeInTheDocument();
      fireEvent.click(within(dock()).getByRole("button", { name: "Hide" }));
      expect(screen.queryByRole("region", { name: "Panel" })).toBeNull();
    });

    it("gives the focus in it, as it is hidden from its Hide or with Ctrl+J, to the status bar's button", () => {
      renderShell();
      fireEvent.click(dockButton());
      within(dock()).getByRole("button", { name: "Hide" }).focus();
      fireEvent.click(within(dock()).getByRole("button", { name: "Hide" }));
      expect(dockButton()).toHaveFocus();
      fireEvent.click(dockButton());
      within(dock()).getByRole("tab", { name: "Activity" }).focus();
      press("j", { ctrlKey: true });
      expect(screen.queryByRole("region", { name: "Panel" })).toBeNull();
      expect(dockButton()).toHaveFocus();
    });

    it("has no button or key without an instance open", () => {
      renderShell({ noInstance: true });
      expect(statusBar().queryByRole("button", { name: "Panel" })).toBeNull();
      document.body.focus();
      expect(press("j", { ctrlKey: true })).toBe(false);
    });

    it("lists the problems of what is shown, its tab and the status bar counting them, the status bar's count opening it at them", () => {
      renderShell({ problems });
      const count = statusBar().getByRole("button", { name: "3 problems" });
      expect(count).not.toHaveAttribute("aria-controls");
      fireEvent.click(count);
      expect(count).toHaveAttribute("aria-controls", dock().id);
      const tabs = within(dock()).getByRole("tablist", { name: "Panel" });
      expect(within(tabs).getByRole("tab", { name: "Problems (3)" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      expect(within(dock()).getByRole("tabpanel", { name: "Problems (3)" })).toHaveTextContent(
        "The problems",
      );
      fireEvent.click(within(tabs).getByRole("tab", { name: "Activity" }));
      expect(within(dock()).getByRole("tabpanel", { name: "Activity" })).toBeInTheDocument();
      // Open already: at the problems again.
      fireEvent.click(count);
      expect(within(tabs).getByRole("tab", { name: "Problems (3)" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });

    it("says so off a deck's or draft's screens, and while the problems are looked for, counts none", () => {
      const { unmount } = renderShell();
      fireEvent.click(dockButton());
      expect(within(dock()).getByRole("tabpanel")).toHaveTextContent(
        "A deck's or a draft's problems are listed on its screens.",
      );
      expect(within(dock()).getByRole("tab", { name: "Problems" })).toBeInTheDocument();
      unmount();
      renderShell({ problems: { ...problems, count: undefined } });
      expect(statusBar().queryByRole("button", { name: /problems?$/ })).toBeNull();
      expect(within(dock()).getByRole("tab", { name: "Problems" })).toBeInTheDocument();
    });

    it("counts none plainly, and some as a warning", () => {
      const { unmount } = renderShell({ problems: { ...problems, count: 0, routes: [] } });
      expect(statusBar().getByRole("button", { name: "0 problems" })).not.toHaveClass(
        "studio-problem-count",
      );
      unmount();
      renderShell({ problems });
      expect(statusBar().getByRole("button", { name: "3 problems" })).toHaveClass(
        "studio-problem-count",
      );
    });

    it("says, in its count, how many of a draft's problems keep it from being published, once", () => {
      const { unmount } = renderShell({ problems: { ...problems, count: 5, blocking: 3 } });
      expect(
        statusBar().getByRole("button", { name: "5 problems, 3 block publishing" }),
      ).toHaveClass("studio-problem-count");
      unmount();
      renderShell({ problems: { ...problems, count: 2, blocking: 3 } });
      expect(
        statusBar().getByRole("button", { name: "3 problems block publishing" }),
      ).toBeInTheDocument();
    });

    it("goes from tab to tab with the arrow keys", () => {
      renderShell();
      fireEvent.click(dockButton());
      const problemsTab = within(dock()).getByRole("tab", { name: "Problems" });
      expect(problemsTab).toHaveAttribute("tabindex", "0");
      expect(fireEvent.keyDown(problemsTab, { key: "ArrowRight" })).toBe(false);
      const activityTab = within(dock()).getByRole("tab", { name: "Activity" });
      expect(activityTab).toHaveAttribute("aria-selected", "true");
      expect(activityTab).toHaveFocus();
      expect(problemsTab).toHaveAttribute("tabindex", "-1");
      fireEvent.keyDown(activityTab, { key: "ArrowLeft" });
      expect(problemsTab).toHaveFocus();
      expect(fireEvent.keyDown(problemsTab, { key: "Enter" })).toBe(true);
    });

    it("keeps what the screens did, the last first, and the draft's saves", () => {
      renderShell({ draftUrl: DRAFT_URL });
      fireEvent.click(dockButton());
      fireEvent.click(within(dock()).getByRole("tab", { name: "Activity" }));
      expect(within(dock()).getByRole("tabpanel")).toHaveTextContent(
        "Nothing done yet since the Studio was opened.",
      );
      act(() => logActivity("Exported 2 decks."));
      act(() => logActivity("Moved 3 cards."));
      const editor = {};
      // Saved three times in a row: one line, counting them.
      for (let n = 0; n < 3; n++) {
        act(() => report(editor, { waiting: 1, failed: false }));
        act(() => report(editor, { waiting: 0, failed: false }));
      }
      act(() => report(editor, { waiting: 0, failed: true }));
      // Each after its time.
      const lines = within(dock())
        .getAllByRole("listitem")
        .map((line) =>
          line.textContent!.slice(line.querySelector("time")!.textContent!.length + 1),
        );
      expect(lines).toEqual([
        "Last change not saved",
        "Draft saved ×3",
        "Moved 3 cards.",
        "Exported 2 decks.",
      ]);
      expect(within(dock()).getAllByRole("listitem")[0]!.querySelector("time")).toHaveAttribute(
        "datetime",
      );
    });

    it("is as tall as its splitter makes it", () => {
      renderShell();
      fireEvent.click(dockButton());
      fireEvent.keyDown(within(dock()).getByRole("separator", { name: "Height of the panel" }), {
        key: "Home",
      });
      expect(dock()).toHaveStyle({ height: `${DOCK_HEIGHT.min}px` });
    });

    it("goes to the next problem's field with F8 and the one before with Shift+F8, as a link does, from a field too", () => {
      const onGo = vi.fn((route: StudioRoute) =>
        window.history.replaceState(null, "", studioRouteToHash(route)),
      );
      const { unmount } = renderShell({ problems, onGo, filter: true });
      document.body.focus();
      expect(press("F8")).toBe(true);
      expect(onGo).toHaveBeenLastCalledWith(groups);
      press("F8");
      expect(onGo).toHaveBeenLastCalledWith(drafts);
      // Two problems in one place: the second is gone to, though the page stays.
      onGo.mockClear();
      press("F8");
      expect(onGo).not.toHaveBeenCalled();
      screen.getByRole("searchbox", { name: "Filter" }).focus();
      expect(press("F8")).toBe(true);
      expect(onGo).toHaveBeenLastCalledWith(groups);
      press("F8", { shiftKey: true });
      expect(onGo).toHaveBeenLastCalledWith(drafts);
      unmount();
      renderShell({ onGo });
      document.body.focus();
      expect(press("F8")).toBe(false);
    });

    it("is among the regions F6 goes to, after the main content", () => {
      renderShell();
      fireEvent.click(dockButton());
      screen.getByRole("main").focus();
      press("F6");
      expect(dock()).toHaveFocus();
      press("F6");
      expect(screen.getByRole("complementary", { name: "Studio status" })).toHaveFocus();
    });

    it("is shown or hidden from the palette, as the aside is", () => {
      wideScreen();
      renderShell({ aside: { label: "Outline", content: <p>The outline</p> } });
      const choose = (name: string) => {
        fireEvent.click(screen.getByRole("button", { name: "Search or run…" }));
        fireEvent.click(
          within(screen.getByRole("dialog", { name: "Quick open" })).getByRole("option", { name }),
        );
      };
      choose("Show or hide the panel: problems and activity");
      expect(dock()).toBeInTheDocument();
      expect(screen.getByRole("complementary", { name: "Outline" })).toBeVisible();
      choose(
        "Show or hide the aside (the outline, the deck, the upgrade), or close the card beside the cards",
      );
      expect(screen.getByRole("button", { name: "Outline" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
  });

  it("gives the drawer a Close of its own, which the header's button under it cannot be", () => {
    const screenSize = narrowScreen();
    renderShell();
    fireEvent.click(toggle());
    fireEvent.click(within(sidebar()).getByRole("button", { name: "Close" }));
    expect(sidebar()).not.toBeVisible();
    expect(toggle()).toHaveFocus();
    // Beside the page, the sidebar has none.
    screenSize.widen();
    expect(within(sidebar()).queryByRole("button", { name: "Close" })).toBeNull();
  });
});
