import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { ActionsMenu } from "./ActionsMenu";
import type { OutlineNode } from "./deckTree/rows";
import { MoveItems } from "./MoveItems";

const step = (key: string): OutlineNode => ({ key, title: { en: `Step ${key}` } });
const chapter = (key: string, steps: OutlineNode[]): OutlineNode => ({ key, title: { en: `Chapter ${key}` }, children: steps });

/** A course's outline: chapters A (steps a1, a2) and B (step b1). */
const outline = [chapter("A", [step("a1"), step("a2")]), chapter("B", [step("b1")])];

/** The moves of `nodeKey` in a course's outline: chapters at the top, steps in a chapter, no new groups. */
function renderMoves(nodeKey: string) {
  const onMove = vi.fn();
  render(
    <ActionsMenu label="Actions" buttonClass="row-menu" open onOpen={() => undefined} onClose={() => undefined}>
      <MoveItems
        nodes={outline}
        nodeKey={nodeKey}
        readOnly={false}
        fits={(parent) => (nodeKey.length === 1 ? parent === null : parent !== null)}
        intoLabel="Move to chapter"
        onMove={onMove}
      />
    </ActionsMenu>,
  );
  return onMove;
}

describe("MoveItems in a course's outline", () => {
  it("moves a step among its neighbours or to another chapter, never out of its chapter or into a group", () => {
    const onMove = renderMoves("a2");
    expect(screen.queryByRole("menuitem", { name: /Move out of/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Group with/ })).toBeNull();
    expect(screen.getByRole("group", { name: "Move to chapter" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Chapter A" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Chapter B" }));
    expect(onMove).toHaveBeenCalledWith({ parent: "B", after: "b1" });
  });

  it("moves a chapter only among the chapters", () => {
    const onMove = renderMoves("B");
    expect(screen.queryByRole("group", { name: "Move to chapter" })).toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Move up" }));
    expect(onMove).toHaveBeenCalledWith({ parent: null, after: null });
  });
});
