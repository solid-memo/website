import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { problem } from "@solid-memo/domain/release/problems";
import { courseDraft, DRAFT_URL } from "../test/fixtures";
import { TrialScreen } from "./TrialScreen";

function renderScreen(props: Partial<Parameters<typeof TrialScreen>[0]> = {}) {
  const onReset = vi.fn();
  const onReload = vi.fn();
  render(
    <TrialScreen
      draft={courseDraft()}
      opening={false}
      error={null}
      problems={null}
      targetHref={(target) => `#/${target.screen}/${"id" in target ? target.id : ""}`}
      onReset={onReset}
      onReload={onReload}
      {...props}
    >
      <p>The trial</p>
    </TrialScreen>,
  );
  return { onReset, onReload };
}

describe("TrialScreen", () => {
  it("shows the trial, which can be started over or played as the draft is now", () => {
    const { onReset, onReload } = renderScreen();
    expect(screen.getByRole("heading", { level: 2, name: "Trial" })).toBeInTheDocument();
    expect(screen.getByText("The trial")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload the draft" }));
    expect(onReset).toHaveBeenCalledOnce();
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("says while the trial is set up, and why it could not be", () => {
    renderScreen({ opening: true, error: new Error("offline") });
    expect(screen.getByText("Setting up the trial…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start over" })).toBeDisabled();
    expect(screen.queryByText("The trial")).toBeNull();
  });

  it("says why it could not be set up", () => {
    renderScreen({ error: new Error("offline") });
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
  });

  it("lists what keeps the draft from being played, each a link to its field", () => {
    renderScreen({ problems: [problem(`${DRAFT_URL}#ch-apps`, { code: "chapterWithoutStep", params: {} })] });
    expect(screen.getByText("This draft cannot be played yet. Fix these first:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Has no step in use." })).toHaveAttribute("href", "#/chapter/");
    expect(screen.getByRole("listitem")).toHaveTextContent(/^Apps: /);
    expect(screen.queryByText("The trial")).toBeNull();
  });
});
