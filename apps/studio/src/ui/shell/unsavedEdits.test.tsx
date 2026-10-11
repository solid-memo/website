import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { shownPosition } from "@solid-memo/ui/routerCore";
import { useUnsavedEdits, type SaveEdits } from "./unsavedEdits";

let guarded: ReturnType<typeof useUnsavedEdits>;

/** A page with an editor that reports its edits (`report`), a way to move away (`guard`), and links, one with a handler of its own. */
function Page({ onFollow }: { onFollow: () => void }) {
  guarded = useUnsavedEdits();
  return (
    <>
      <p tabIndex={-1}>The editor</p>
      <a href="#/studio/drafts">Drafts</a>
      <a
        href="#/studio/groups"
        onClick={(event) => {
          event.preventDefault();
          onFollow();
        }}
      >
        Groups
      </a>
      <a href="#main">Skip to the content</a>
      {guarded.dialog}
    </>
  );
}

const question = () => screen.queryByRole("dialog", { name: "Save your changes?" });
const answer = (name: string) => fireEvent.click(within(question()!).getByRole("button", { name }));

function renderPage(save?: SaveEdits) {
  const onFollow = vi.fn();
  render(<Page onFollow={onFollow} />);
  if (save !== undefined) act(() => guarded.report(save));
  return { onFollow };
}

describe("useUnsavedEdits", () => {
  beforeEach(() => window.history.replaceState(null, "", "#/studio/cards"));

  it("moves at once while nothing is unsaved, and once the editor says there is nothing", () => {
    renderPage(async () => true);
    act(() => guarded.report(null));
    const move = vi.fn();
    guarded.guard(move);
    expect(move).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("link", { name: "Drafts" }));
    expect(window.location.hash).toBe("#/studio/drafts");
    expect(question()).toBeNull();
  });

  it("keeps each editor's edits apart, and saves them all before it moves, staying when one is not saved", async () => {
    const card = vi.fn(async () => true);
    const cell = vi.fn(async () => false);
    renderPage(card);
    act(() => guarded.report(cell, "cell"));
    const move = vi.fn();
    act(() => guarded.guard(move));
    answer("Save");
    await waitFor(() => expect(cell).toHaveBeenCalled());
    expect(card).toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    act(() => guarded.report(null, "cell"));
    act(() => guarded.guard(move));
    expect(question()).not.toBeNull();
    answer("Discard");
    expect(move).toHaveBeenCalledTimes(1);
  });

  it("asks first while edits are unsaved: Stay moves nowhere, Discard moves without them, Save saves them, then moves", async () => {
    const save = vi.fn(async () => true);
    renderPage(save);
    const move = vi.fn();
    screen.getByText("The editor").focus();
    act(() => guarded.guard(move));
    expect(question()).toHaveTextContent("Some changes are not saved.");
    expect(within(question()!).getByRole("button", { name: "Save" })).toHaveFocus();
    expect(within(question()!).getByRole("button", { name: "Discard" })).toHaveClass("danger");
    answer("Stay");
    expect(question()).toBeNull();
    expect(move).not.toHaveBeenCalled();
    expect(screen.getByText("The editor")).toHaveFocus();
    act(() => guarded.guard(move));
    answer("Discard");
    expect(move).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    // Discarded, the edits are left behind: the editor reports any made after.
    act(() => guarded.guard(move));
    expect(move).toHaveBeenCalledTimes(2);
    act(() => guarded.report(save));
    act(() => guarded.guard(move));
    answer("Save");
    expect(question()).toBeNull();
    await waitFor(() => expect(move).toHaveBeenCalledTimes(3));
    expect(save).toHaveBeenCalled();
  });

  it("stays when the save failed or was refused, and when the question is closed unanswered", async () => {
    const save = vi.fn(async () => false);
    renderPage(save);
    const move = vi.fn();
    act(() => guarded.guard(move));
    answer("Save");
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(move).not.toHaveBeenCalled();
    act(() => guarded.guard(move));
    fireEvent.click(within(question()!).getByRole("button", { name: "Close" }));
    expect(question()).toBeNull();
    expect(move).not.toHaveBeenCalled();
  });

  it("asks before a link to another of the app's pages is followed, then follows it as it would have been", () => {
    const { onFollow } = renderPage(async () => true);
    fireEvent.click(screen.getByRole("link", { name: "Groups" }));
    expect(onFollow).not.toHaveBeenCalled();
    answer("Discard");
    expect(onFollow).toHaveBeenCalledTimes(1);
    act(() => guarded.report(async () => true));
    fireEvent.click(screen.getByRole("link", { name: "Drafts" }));
    expect(window.location.hash).toBe("#/studio/cards");
    answer("Discard");
    expect(window.location.hash).toBe("#/studio/drafts");
  });

  it("undoes Back or Forward first while edits are unsaved, before the router hears of it, and goes there once answered", async () => {
    const router = vi.fn();
    window.addEventListener("hashchange", router);
    const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
    const save = vi.fn(async () => true);
    renderPage(save);
    /** The browser going to another entry of the history, numbered as the router numbers it (null: a new one), as Back does. */
    const pop = (to: string, position: number | null = null) =>
      act(() => {
        const oldURL = window.location.href;
        window.history.replaceState(position === null ? null : { position }, "", to);
        window.dispatchEvent(
          new HashChangeEvent("hashchange", { oldURL, newURL: window.location.href }),
        );
      });
    const at = shownPosition();
    const length = window.history.length;
    // Back two entries: undone by going as far forward, the history as it was.
    pop("#/studio/drafts", at - 2);
    expect(router).not.toHaveBeenCalled();
    expect(go).toHaveBeenLastCalledWith(2);
    expect(window.history.length).toBe(length);
    // Undone, the browser back at the page shown: no move to ask about.
    pop("#/studio/cards", at);
    expect(router).toHaveBeenCalledTimes(1);
    answer("Stay");
    expect(go).toHaveBeenCalledTimes(1);
    // Forward, or a hash typed in (a new entry): undone by going back.
    pop("#/studio/drafts", at + 1);
    expect(go).toHaveBeenLastCalledWith(-1);
    pop("#/studio/cards", at);
    answer("Discard");
    expect(go).toHaveBeenLastCalledWith(1);
    // Answered, the move is not asked about again.
    pop("#/studio/drafts");
    expect(question()).toBeNull();
    expect(router).toHaveBeenCalledTimes(3);
    act(() => guarded.report(save));
    pop("#/studio/groups");
    expect(go).toHaveBeenLastCalledWith(-1);
    pop("#/studio/drafts", at);
    answer("Save");
    await waitFor(() => expect(go).toHaveBeenLastCalledWith(1));
    expect(save).toHaveBeenCalled();
    act(() => guarded.report(save));
    // An entry numbered as the page shown is is taken for a new one.
    pop("#/studio/groups", shownPosition());
    expect(go).toHaveBeenLastCalledWith(-1);
    go.mockRestore();
    window.removeEventListener("hashchange", router);
  });

  it("drops the edits of an editor that stays on the page once they are discarded, and asks of those made after", () => {
    const discard = vi.fn();
    renderPage();
    act(() => guarded.report(async () => true, "cell", discard));
    const move = vi.fn();
    act(() => guarded.guard(move));
    answer("Discard");
    expect(discard).toHaveBeenCalledTimes(1);
    expect(move).toHaveBeenCalledTimes(1);
    act(() => guarded.report(async () => true, "cell", discard));
    act(() => guarded.guard(move));
    expect(question()).not.toBeNull();
  });

  it("leaves a hash change to the page shown, or with nothing unsaved, to the router", () => {
    const router = vi.fn();
    window.addEventListener("hashchange", router);
    renderPage(async () => true);
    window.dispatchEvent(
      new HashChangeEvent("hashchange", {
        oldURL: window.location.href,
        newURL: window.location.href,
      }),
    );
    act(() => guarded.report(null));
    window.dispatchEvent(
      new HashChangeEvent("hashchange", {
        oldURL: "https://app.example/#/studio/drafts",
        newURL: window.location.href,
      }),
    );
    expect(router).toHaveBeenCalledTimes(2);
    expect(question()).toBeNull();
    window.removeEventListener("hashchange", router);
  });

  it("has the browser ask before the page is left while edits are unsaved", () => {
    renderPage(async () => true);
    const leave = () => window.dispatchEvent(new Event("beforeunload", { cancelable: true }));
    expect(leave()).toBe(false);
    act(() => guarded.report(null));
    expect(leave()).toBe(true);
  });

  it("leaves alone a link to the page shown, within the page, or opened elsewhere", () => {
    window.history.replaceState(null, "", "#/studio/drafts");
    const { onFollow } = renderPage(async () => true);
    fireEvent.click(screen.getByRole("link", { name: "Drafts" }));
    fireEvent.click(screen.getByRole("link", { name: "Skip to the content" }));
    fireEvent.click(screen.getByRole("link", { name: "Groups" }), { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "Groups" }), { button: 1 });
    expect(question()).toBeNull();
    expect(onFollow).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByText("The editor"));
    expect(question()).toBeNull();
  });
});
