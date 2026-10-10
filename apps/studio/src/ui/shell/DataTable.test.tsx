import { describe, expect, it, vi } from "vitest";
import { useState } from "preact/hooks";
import { act, fireEvent, render, screen, within } from "@testing-library/preact";
import { WithKeys } from "../../test/keys";
import { DataTable, type Column } from "./DataTable";
import { NO_SELECTION, type Selection } from "./tableModel";

interface Planet {
  name: string;
  moons: number;
}

const planets: Planet[] = [
  { name: "Mercury", moons: 0 },
  { name: "Venus", moons: 0 },
  { name: "Earth", moons: 1 },
  { name: "Mars", moons: 2 },
];

const name: Column<Planet> = { key: "name", label: "Planet", cell: (planet) => <a href={`#/${planet.name}`}>{planet.name}</a> };
const moons: Column<Planet> = { key: "moons", label: "Moons", number: true, cell: (planet) => planet.moons };

type Props = Parameters<typeof DataTable<Planet>>[0];

/** The table with its selection kept as a screen keeps it, every change seen by `onChoose`. */
function Harness({ selectable = true, onChoose, ...overrides }: Partial<Props> & { selectable?: boolean; onChoose?: (chosen: Selection) => void }) {
  const [chosen, setChosen] = useState<Selection>(NO_SELECTION);
  return (
    <WithKeys>
      <p tabIndex={-1}>Above the table</p>
      <DataTable
        caption="The planets"
        rows={planets}
        keyOf={(planet) => planet.name}
        name={name}
        columns={[moons]}
        {...(selectable
          ? {
              select: {
                label: "Select",
                allLabel: "Select every planet",
                rowLabel: (planet: Planet) => `Select ${planet.name}`,
                chosen,
                onChoose: (next: Selection) => {
                  onChoose?.(next);
                  setChosen(next);
                },
              },
            }
          : {})}
        {...overrides}
      />
    </WithKeys>
  );
}

const table = () => screen.getByRole("table", { name: "The planets" });
const row = (planet: string) => within(table()).getByRole("row", { name: new RegExp(planet) });
const link = (planet: string) => within(table()).getByRole("link", { name: planet });
const box = (planet: string) => screen.getByRole("checkbox", { name: `Select ${planet}` });
const key = (name: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement ?? document.body, { key: name, ...init });
const selected = () => planets.filter((planet) => (box(planet.name) as HTMLInputElement).checked).map((planet) => planet.name);

describe("DataTable", () => {
  it("has its caption, a header for each column shown, the name of each row its header, and figures aligned", () => {
    render(<Harness selectable={false} hidden={new Set(["nothing"])} />);
    expect(within(table()).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Planet", "Moons"]);
    expect(within(table()).queryByRole("button")).toBeNull();
    expect(within(table()).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["Mercury", "Venus", "Earth", "Mars"]);
    expect(within(row("Mars")).getByRole("cell")).toHaveClass("number");
    expect(row("Mars")).not.toHaveAttribute("class");
    expect(table()).toHaveClass("studio-list", "studio-data-table");
    expect(table()).not.toHaveClass("selectable");
  });

  it("leaves out the columns hidden", () => {
    render(<Harness selectable={false} hidden={new Set(["moons"])} />);
    expect(within(table()).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Planet"]);
    expect(within(row("Mars")).queryByRole("cell")).toBeNull();
  });

  it("sorts by a column's header, which says how", () => {
    const onSort = vi.fn();
    render(<Harness sort={{ key: "moons", descending: true }} onSort={onSort} class="planets" />);
    expect(table()).toHaveClass("planets", "selectable");
    expect(within(table()).getByRole("columnheader", { name: "Moons" })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(within(table()).getByRole("button", { name: "Planet" }));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("selects rows by their checkbox, every row at once, and a range with Shift held, marking those selected", () => {
    render(<Harness classOf={(planet) => (planet.moons === 0 ? "moonless" : undefined)} />);
    fireEvent.click(box("Venus"));
    expect(row("Venus")).toHaveClass("moonless", "selected");
    fireEvent.click(box("Mars"), { shiftKey: true });
    expect(selected()).toEqual(["Venus", "Earth", "Mars"]);
    fireEvent.click(box("Earth"), { shiftKey: true });
    expect(selected()).toEqual(["Venus"]);
    const all = screen.getByRole("checkbox", { name: "Select every planet" });
    fireEvent.click(all);
    expect(all).toBeChecked();
    expect(selected()).toEqual(["Mercury", "Venus", "Earth", "Mars"]);
    fireEvent.click(all);
    expect(selected()).toEqual([]);
    // With nothing ticked before, Shift selects the row alone.
    render(<Harness />, { container: document.body.appendChild(document.createElement("div")) });
    const second = screen.getAllByRole("checkbox", { name: "Select Earth" })[1]!;
    fireEvent.click(second, { shiftKey: true });
    expect(second).toBeChecked();
  });

  it("moves the cursor with j and k, marking its row, and follows the focus into the table", () => {
    render(<Harness />);
    screen.getByText("Above the table").focus();
    key("k");
    expect(link("Mercury")).toHaveFocus();
    expect(row("Mercury")).toHaveClass("cursor");
    key("j");
    key("j");
    expect(link("Earth")).toHaveFocus();
    expect(row("Mercury")).not.toHaveClass("cursor");
    act(() => box("Mars").focus());
    expect(row("Mars")).toHaveClass("cursor");
    key("j");
    expect(link("Mars")).toHaveFocus();
    // From outside the table, from the cursor's row.
    screen.getByText("Above the table").focus();
    key("k");
    expect(link("Earth")).toHaveFocus();
  });

  it("selects with x the row the focus is in, or the cursor's from the page's body, else none", () => {
    const onChoose = vi.fn();
    render(<Harness onChoose={onChoose} />);
    screen.getByText("Above the table").focus();
    key("x");
    expect(onChoose).not.toHaveBeenCalled();
    key("j");
    key("x");
    expect(selected()).toEqual(["Mercury"]);
    key("j");
    (document.activeElement as HTMLElement).blur();
    expect(document.body).toHaveFocus();
    key("x");
    expect(selected()).toEqual(["Mercury", "Venus"]);
    key("x");
    expect(selected()).toEqual(["Mercury"]);
  });

  it("selects on with Shift+J and Shift+K from where the selection was last made, and clears it with Escape", () => {
    render(<Harness />);
    document.body.focus();
    key("j");
    key("j");
    expect(key("J")).toBe(false);
    expect(selected()).toEqual(["Venus", "Earth"]);
    expect(link("Earth")).toHaveFocus();
    key("J");
    expect(selected()).toEqual(["Venus", "Earth", "Mars"]);
    key("K");
    key("K");
    key("K");
    expect(link("Mercury")).toHaveFocus();
    expect(selected()).toEqual(["Mercury", "Venus", "Earth", "Mars"]);
    expect(key("Escape")).toBe(false);
    expect(selected()).toEqual([]);
    // Nothing selected: Escape is left alone.
    expect(key("Escape")).toBe(true);
    // From outside the table, the extending keys have no row.
    screen.getByText("Above the table").focus();
    expect(key("J")).toBe(true);
  });

  it("selects on with Shift+J from the row the focus is in, where no selection was made", () => {
    render(<Harness />);
    act(() => box("Venus").focus());
    key("J");
    expect(selected()).toEqual(["Venus", "Earth"]);
    expect(link("Earth")).toHaveFocus();
  });

  it("opens with Enter the row the focus is in, leaving the row's link its own Enter", () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    document.body.focus();
    key("j");
    expect(key("Enter")).toBe(true);
    box("Venus").focus();
    expect(key("Enter")).toBe(false);
    expect(onOpen).toHaveBeenCalledWith(planets[1]);
    screen.getByText("Above the table").focus();
    expect(key("Enter")).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("has no keys of selection or opening without them, and moves along rows without links", () => {
    render(<Harness selectable={false} name={{ key: "name", label: "Planet", cell: (planet) => planet.name }} />);
    document.body.focus();
    expect(key("j")).toBe(false);
    expect(row("Mercury")).toHaveClass("cursor");
    expect(document.body).toHaveFocus();
    for (const name of ["x", "J", "Escape", "Enter"]) expect(key(name)).toBe(true);
  });

  it("has no keys without rows", () => {
    render(<Harness rows={[]} />);
    document.body.focus();
    expect(key("j")).toBe(true);
  });

  it("keeps its cursor on the row shown beside it, asks j and k to show another, and takes the focus to it once shown", () => {
    const onMove = vi.fn();
    const { rerender } = render(<Harness current="Venus" onMove={onMove} />);
    expect(row("Venus")).toHaveAttribute("aria-current", "true");
    expect(row("Venus")).toHaveClass("cursor");
    document.body.focus();
    key("j");
    expect(onMove).toHaveBeenCalledWith(planets[2]);
    expect(row("Venus")).toHaveClass("cursor");
    expect(document.body).toHaveFocus();
    rerender(<Harness current="Earth" onMove={onMove} />);
    expect(row("Earth")).toHaveClass("cursor");
    expect(link("Earth")).toHaveFocus();
    // Shown by other means: the focus stays.
    screen.getByText("Above the table").focus();
    rerender(<Harness current="Mars" onMove={onMove} />);
    expect(screen.getByText("Above the table")).toHaveFocus();
    // At the end: the row shown is focused, no other asked for.
    key("j");
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(link("Mars")).toHaveFocus();
  });

  it("takes the focus nowhere when the row asked to be shown has left the table meanwhile", () => {
    const onMove = vi.fn();
    const { rerender } = render(<Harness current="Venus" onMove={onMove} />);
    document.body.focus();
    key("j");
    rerender(<Harness current="Earth" onMove={onMove} rows={planets.slice(0, 2)} />);
    expect(document.body).toHaveFocus();
    expect(within(table()).queryByRole("row", { current: true })).toBeNull();
  });

  it("shows from either end beside it the row beyond the table, and takes the focus to it once shown", () => {
    const onMove = vi.fn();
    const around = { previous: { name: "Sun", moons: 0 }, next: { name: "Jupiter", moons: 95 } };
    const { rerender } = render(<Harness current="Mars" onMove={onMove} around={around} />);
    document.body.focus();
    key("j");
    expect(onMove).toHaveBeenLastCalledWith(around.next);
    rerender(<Harness current="Jupiter" onMove={onMove} rows={[...planets, around.next]} />);
    expect(link("Jupiter")).toHaveFocus();
    rerender(<Harness current="Mercury" onMove={onMove} around={around} />);
    link("Mercury").focus();
    key("k");
    expect(onMove).toHaveBeenLastCalledWith(around.previous);
    // Without a row beyond, none is asked for.
    rerender(<Harness current="Mercury" onMove={onMove} />);
    key("k");
    expect(onMove).toHaveBeenCalledTimes(2);
  });

  it("keeps its cursor on the row shown beside it once none is, and takes the lost focus back to it", () => {
    const { rerender } = render(<Harness current="Earth" onMove={vi.fn()} />);
    document.body.focus();
    rerender(<Harness />);
    expect(row("Earth")).toHaveClass("cursor");
    expect(link("Earth")).toHaveFocus();
    // The focus elsewhere stays there.
    rerender(<Harness current="Venus" onMove={vi.fn()} />);
    screen.getByText("Above the table").focus();
    rerender(<Harness />);
    expect(row("Venus")).toHaveClass("cursor");
    expect(screen.getByText("Above the table")).toHaveFocus();
  });
});
