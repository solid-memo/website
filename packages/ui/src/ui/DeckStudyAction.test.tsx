import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { DeckStudyAction } from "./DeckStudyAction";
import { I18nProvider } from "./i18n";
import type { Card, Prompt } from "@solid-memo/domain/deck";
import type { StudyQueue } from "@solid-memo/domain/scheduling";

const card: Card = {
  id: "card-1",
  url: "https://pod.example/solid-memo/a/decks/deck-1.ttl#card-1",
  front: { "": "水" },
  back: { "": "water" },
  createdAt: "2026-09-21T10:00:00.000Z",
  formatVersion: 1,
};
const prompt: Prompt = { card, direction: "front-to-back" };

function renderAction(queue: StudyQueue | undefined, loading = false) {
  const onStudy = vi.fn();
  const view = render(
    <DeckStudyAction
      deckName="Kanji N5"
      queue={queue && { dueCount: queue.due.length, newCount: queue.newPrompts.length }}
      loading={loading}
      onStudy={onStudy}
    />,
  );
  return { ...view, onStudy };
}

describe("DeckStudyAction", () => {
  it("offers Study with due and new counted together", () => {
    const { onStudy } = renderAction({
      due: [prompt],
      newPrompts: [prompt],
      studiedToday: 0,
    });
    const study = screen.getByRole("button", { name: "Study Kanji N5" });
    expect(study).toHaveClass("primary");
    expect(screen.getByText("2 to review")).toBeInTheDocument();
    fireEvent.click(study);
    expect(onStudy).toHaveBeenCalledOnce();
  });

  it("offers Study when nothing is due but new cards remain", () => {
    const { onStudy } = renderAction({
      due: [],
      newPrompts: [prompt],
      studiedToday: 3,
    });
    expect(screen.getByText("1 to review")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Study Kanji N5" }));
    expect(onStudy).toHaveBeenCalledOnce();
  });

  it("shows how many cards are due when none are new", () => {
    renderAction({ due: [prompt, prompt, prompt], newPrompts: [], studiedToday: 0 });
    expect(screen.getByText("3 to review")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Study Kanji N5" })).toBeInTheDocument();
  });

  it("says there is nothing to study, with a checkmark instead of an action", () => {
    const { container } = renderAction({ due: [], newPrompts: [], studiedToday: 12 });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Done for today")).toBeInTheDocument();
    expect(container.querySelector(".study-done svg.icon")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByText(/review/)).toBeNull();
  });

  it("shows a skeleton for the counts and a loader for the action while the queue is first fetched", () => {
    const { container } = renderAction(undefined, true);
    const loader = screen.getByText("Checking what is due").parentElement!;
    expect(loader).toHaveClass("study-loading");
    expect(loader.querySelector(".loading-dots")).toHaveAttribute("aria-hidden", "true");
    // A row's loader is no live region: a list of them would only clutter it.
    expect(screen.queryByRole("status")).toBeNull();
    const skeleton = container.querySelector(".study-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
    expect(skeleton).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers nothing when the queue is unknown and not being fetched", () => {
    const { container } = renderAction(undefined);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DeckStudyAction in Swedish", () => {
  it("offers Studera with the count in Swedish", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <DeckStudyAction deckName="Kanji N5" queue={{ dueCount: 2, newCount: 0 }} loading={false} onStudy={vi.fn()} />
      </I18nProvider>,
    );
    expect(screen.getByRole("button", { name: "Studera Kanji N5" })).toHaveTextContent("Studera");
    expect(screen.getByText("2 att repetera")).toBeInTheDocument();
  });
});
