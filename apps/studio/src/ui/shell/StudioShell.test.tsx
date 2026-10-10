import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { useContext } from "preact/hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DRAFT_URL, instanceA } from "../../test/fixtures";
import { DraftWaiting, type EditorReport } from "../draftEditor";
import { studioRouteToHash, type StudioRoute } from "../router";
import { StudioShell } from "./StudioShell";

/** Says what a draft editor would: how many of its changes wait. */
let report: (editor: object, report: EditorReport) => void;
function Editor() {
  report = useContext(DraftWaiting);
  return <p>An editor</p>;
}

function renderShell(
  props: { draftUrl?: string | null; queryClient?: QueryClient; onGo?: (route: StudioRoute) => void; noInstance?: true; filter?: true } = {},
) {
  const queryClient = props.queryClient ?? new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <StudioShell
        banner={<p>The masthead</p>}
        backHref="#/decks"
        instance={props.noInstance ? null : instanceA}
        draftUrl={props.draftUrl ?? null}
        onGo={props.onGo ?? (() => undefined)}
      >
        <Editor />
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

describe("StudioShell", () => {
  beforeEach(() => localStorage.clear());

  it("lays the page out as the Studio while it is shown, compact at first, and gives it back to Solid Memo after", async () => {
    const { unmount } = renderShell();
    expect(root.getAttribute("data-surface")).toBe("studio");
    expect(root.getAttribute("data-density")).toBe("compact");
    expect(screen.getByText("The masthead").closest("header")).toHaveClass("site-header");
    expect(screen.getByRole("link", { name: "Back to Solid Memo" })).toHaveAttribute("href", "#/decks");
    expect(within(screen.getByRole("main")).getByText("An editor")).toBeInTheDocument();
    unmount();
    await waitFor(() => expect(root.getAttribute("data-surface")).toBeNull());
    expect(root.getAttribute("data-density")).toBeNull();
  });

  it("names the open instance in the status bar, and says nothing of a draft off a draft's screens", () => {
    renderShell();
    expect(statusBar().getByText(instanceA.name)).toBeInTheDocument();
    expect(statusBar().queryByText("Draft saved")).toBeNull();
  });

  it("switches the density from the status bar, without a history entry, and keeps it on this device", () => {
    const length = window.history.length;
    const { unmount } = renderShell();
    const comfortable = statusBar().getByRole("button", { name: "Comfortable" });
    expect(statusBar().getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
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
    expect(within(help).getByRole("heading", { name: "Anywhere in the Studio" })).toBeInTheDocument();
    expect(within(help).getByRole("heading", { name: "In the card workbench" })).toBeInTheDocument();
    expect(within(help).getByText("Go to the decks").previousElementSibling).toHaveTextContent("g d");
    expect(within(help).getByText("Go to the previous region").previousElementSibling!.querySelectorAll("kbd")).toHaveLength(2);
    expect(within(help).getByText("Open the card")).toBeInTheDocument();
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

  it("moves between the regions with F6 and Shift+F6, from a field too", () => {
    renderShell({ filter: true });
    const header = screen.getByText("The masthead").closest("header")!;
    const main = screen.getByRole("main");
    const status = screen.getByRole("complementary", { name: "Studio status" });
    document.body.focus();
    press("F6");
    expect(header).toHaveFocus();
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
    expect(header).toHaveFocus();
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
    window.history.replaceState(null, "", studioRouteToHash({ screen: "groups", instanceUrl: instanceA.url }));
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

  it("leaves a key that what has the focus took", () => {
    renderShell();
    const header = screen.getByText("The masthead").closest("header")!;
    header.addEventListener("keydown", (event) => event.preventDefault());
    header.focus();
    press("?");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
