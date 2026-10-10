import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { TrialControls } from "./TrialControls";

const chapters = [
  { id: "ch-1", title: { en: "Linked data" } },
  { id: "ch-2", title: { en: "Pods" } },
];

function renderControls(props: Partial<Parameters<typeof TrialControls>[0]> = {}) {
  const handlers = { onJump: vi.fn(), onAnswerAll: vi.fn(), onAdvance: vi.fn() };
  render(
    <TrialControls coursePage="#/course" chapters={chapters} answerHint="course" days={0} busy={false} error={null} {...handlers} {...props} />,
  );
  return handlers;
}

describe("TrialControls", () => {
  it("opens a course's page or a chapter, answers all right or wrong, and moves the clock ahead", () => {
    const { onJump, onAnswerAll, onAdvance } = renderControls();
    expect(screen.getByRole("heading", { name: "Trial controls" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The course's page" })).toHaveAttribute("href", "#/course");
    expect(screen.getByRole("status")).toHaveTextContent("The trial is at today's date.");
    fireEvent.change(screen.getByRole("combobox", { name: "Chapter" }), { target: { value: "ch-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Open the chapter" }));
    expect(onJump).toHaveBeenCalledWith("ch-2");
    expect(screen.getByText(/^Every question of the chapter in view/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Answer all right" }));
    fireEvent.click(screen.getByRole("button", { name: "Answer all wrong" }));
    expect(onAnswerAll.mock.calls).toEqual([[true], [false]]);
    fireEvent.input(screen.getByRole("spinbutton", { name: "Days ahead" }), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Advance" }));
    expect(onAdvance).toHaveBeenCalledWith(3);
  });

  it("has no chapters nor course page for a deck, its answers to the cards to study", () => {
    renderControls({ coursePage: null, chapters: [], answerHint: "deck", days: 1 });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/^Every card to study now/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The trial is 1 day ahead.");
  });

  it("offers no answers when nothing is asked, holds every control while one runs, and says why one failed", () => {
    renderControls({ answerHint: null, busy: true, days: 2, error: new Error("offline") });
    expect(screen.queryByRole("button", { name: "Answer all right" })).toBeNull();
    expect(screen.getByRole("group")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Working…");
    expect(screen.getByRole("alert")).toHaveTextContent("offline");
  });
});
