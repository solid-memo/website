import { beforeEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { useContext } from "preact/hooks";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DRAFT_URL, instanceA } from "../../test/fixtures";
import { DraftWaiting, type EditorReport } from "../draftEditor";
import { StudioShell } from "./StudioShell";

/** Says what a draft editor would: how many of its changes wait. */
let report: (editor: object, report: EditorReport) => void;
function Editor() {
  report = useContext(DraftWaiting);
  return <p>An editor</p>;
}

function renderShell(props: { draftUrl?: string | null; queryClient?: QueryClient } = {}) {
  const queryClient = props.queryClient ?? new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <StudioShell banner={<p>The masthead</p>} backHref="#/decks" instance={instanceA} draftUrl={props.draftUrl ?? null}>
        <Editor />
      </StudioShell>
    </QueryClientProvider>,
  );
}

const statusBar = () => within(screen.getByRole("complementary", { name: "Studio status" }));
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
});
