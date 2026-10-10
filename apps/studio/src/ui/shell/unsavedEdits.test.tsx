import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
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

  it("asks first while edits are unsaved: Stay moves nowhere, Discard moves without them, Save saves them, then moves", async () => {
    const save = vi.fn(async () => true);
    renderPage(save);
    const move = vi.fn();
    screen.getByText("The editor").focus();
    act(() => guarded.guard(move));
    expect(question()).toHaveTextContent("This card has changes that are not saved.");
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
    act(() => guarded.guard(move));
    answer("Save");
    expect(question()).toBeNull();
    await waitFor(() => expect(move).toHaveBeenCalledTimes(2));
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
    fireEvent.click(screen.getByRole("link", { name: "Drafts" }));
    expect(window.location.hash).toBe("#/studio/cards");
    answer("Discard");
    expect(window.location.hash).toBe("#/studio/drafts");
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
