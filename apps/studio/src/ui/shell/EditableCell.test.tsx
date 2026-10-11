import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/preact";
import { WithKeys } from "../../test/keys";
import { DataTable } from "./DataTable";
import { EditableCell, type CellEdit } from "./EditableCell";
import { UnsavedEdits, type ReportUnsaved } from "./unsavedEdits";

const moons = (more: Partial<CellEdit> = {}): CellEdit => ({
  label: "Moons of Mars",
  shown: "2",
  value: "2",
  onSave: vi.fn(async () => true),
  ...more,
});

function renderCell(edit: CellEdit | null, report: ReportUnsaved = () => undefined) {
  return render(
    <UnsavedEdits.Provider value={report}>
      <p tabIndex={-1}>Elsewhere</p>
      <EditableCell edit={edit}>
        <span>2</span>
      </EditableCell>
    </UnsavedEdits.Provider>,
  );
}

const button = () => screen.getByRole("button", { name: "Moons of Mars: 2" });
const field = () => screen.getByRole("textbox", { name: "Moons of Mars" });
const key = (target: Element, name: string) => fireEvent.keyDown(target, { key: name });

describe("EditableCell", () => {
  it("is what it shows when it cannot be edited", () => {
    renderCell(null);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens a field from its button, the value selected, and saves it with Enter, the focus back on the cell", async () => {
    const edit = moons();
    renderCell(edit);
    expect(button()).toHaveTextContent(/^2$/);
    expect(button()).toHaveAttribute("aria-keyshortcuts", "F2");
    fireEvent.click(button());
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue("2");
    expect([(field() as HTMLInputElement).selectionStart, (field() as HTMLInputElement).selectionEnd]).toEqual([0, 1]);
    fireEvent.input(field(), { target: { value: "3" } });
    key(field(), "Enter");
    await waitFor(() => expect(button()).toHaveFocus());
    expect(edit.onSave).toHaveBeenCalledWith("3");
  });

  it("leaves the value as it was with Escape or Cancel", () => {
    const edit = moons();
    renderCell(edit);
    fireEvent.click(button());
    fireEvent.input(field(), { target: { value: "3" } });
    // Other keys are the field's.
    key(field(), "a");
    expect(field()).toBeInTheDocument();
    key(field(), "Escape");
    expect(button()).toHaveFocus();
    fireEvent.click(button());
    expect(field()).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(button()).toHaveFocus();
    expect(edit.onSave).not.toHaveBeenCalled();
  });

  it("closes without saving a value left as it was, with Save too", async () => {
    const edit = moons();
    renderCell(edit);
    fireEvent.click(button());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(button()).toHaveFocus());
    expect(edit.onSave).not.toHaveBeenCalled();
  });

  it("keeps a value refused in its field, marked invalid until it changes, and saves once at a time", async () => {
    let refuse!: (ok: boolean) => void;
    const edit = moons({ onSave: vi.fn(() => new Promise<boolean>((resolve) => (refuse = resolve))) });
    renderCell(edit);
    fireEvent.click(button());
    fireEvent.input(field(), { target: { value: "-1" } });
    key(field(), "Enter");
    key(field(), "Enter");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await act(async () => refuse(false));
    expect(edit.onSave).toHaveBeenCalledTimes(1);
    expect(field()).toHaveAttribute("aria-invalid", "true");
    fireEvent.input(field(), { target: { value: "1" } });
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("edits a number, or a choice", async () => {
    const { unmount } = renderCell(moons({ number: true }));
    fireEvent.click(button());
    const number = screen.getByRole("spinbutton", { name: "Moons of Mars" });
    expect(number).toHaveAttribute("min", "0");
    expect(number).toHaveAttribute("step", "1");
    unmount();
    const edit = moons({ options: [{ value: "2", label: "Two" }, { value: "3", label: "Three" }] });
    renderCell(edit);
    fireEvent.click(button());
    const choice = screen.getByRole("combobox", { name: "Moons of Mars" });
    fireEvent.change(choice, { target: { value: "3" } });
    key(choice, "Enter");
    await waitFor(() => expect(edit.onSave).toHaveBeenCalledWith("3"));
  });

  it("reports a value changed and not saved, which stays as the focus leaves; one left as it was closes", async () => {
    const report = vi.fn<ReportUnsaved>();
    const edit = moons();
    const { unmount } = renderCell(edit, report);
    fireEvent.click(button());
    fireEvent.focusOut(field(), { relatedTarget: screen.getByRole("button", { name: "Save" }) });
    expect(field()).toBeInTheDocument();
    fireEvent.focusOut(field(), { relatedTarget: screen.getByText("Elsewhere") });
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(button());
    fireEvent.input(field(), { target: { value: "3" } });
    const [save, from] = report.mock.lastCall!;
    expect(save).not.toBeNull();
    fireEvent.focusOut(field(), { relatedTarget: screen.getByText("Elsewhere") });
    expect(field()).toHaveValue("3");
    await act(async () => expect(await save!()).toBe(true));
    expect(edit.onSave).toHaveBeenCalledWith("3");
    expect(report).toHaveBeenLastCalledWith(null, from);
    unmount();
    expect(report).toHaveBeenLastCalledWith(null, from);
  });

  it("saves, from elsewhere, as the cell is edited then, and closes once its edits are discarded there", async () => {
    const report = vi.fn<ReportUnsaved>();
    const cell = (edit: CellEdit) => (
      <UnsavedEdits.Provider value={report}>
        <p tabIndex={-1}>Elsewhere</p>
        <EditableCell edit={edit}>
          <span>2</span>
        </EditableCell>
      </UnsavedEdits.Provider>
    );
    const { rerender } = render(cell(moons()));
    fireEvent.click(button());
    fireEvent.input(field(), { target: { value: "3" } });
    const [save] = report.mock.lastCall!;
    // Another cell of the row saved meanwhile: its row read afresh, the cell's edit is another.
    const now = moons({ onSave: vi.fn(async () => true) });
    rerender(cell(now));
    await act(async () => expect(await save!()).toBe(true));
    expect(now.onSave).toHaveBeenCalledWith("3");
    fireEvent.click(button());
    fireEvent.input(field(), { target: { value: "4" } });
    screen.getByText("Elsewhere").focus();
    act(() => report.mock.lastCall![2]!());
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Elsewhere")).toHaveFocus();
  });

  it("leaves Enter and Escape to an input method composing", () => {
    const edit = moons();
    renderCell(edit);
    fireEvent.click(button());
    fireEvent.input(field(), { target: { value: "3" } });
    fireEvent.keyDown(field(), { key: "Enter", isComposing: true });
    fireEvent.keyDown(field(), { key: "Escape", keyCode: 229 });
    expect(field()).toHaveValue("3");
    expect(edit.onSave).not.toHaveBeenCalled();
  });

  it("opens with F2 on its row: the cell the focus is in, else the row's first, a link's too", () => {
    const save = vi.fn(async () => true);
    const cell = (label: string, link = false) => (
      <EditableCell edit={{ label, shown: "x", value: "x", onSave: save }} link={link}>
        {link ? <a href="#/mars">Mars</a> : "x"}
      </EditableCell>
    );
    render(
      <WithKeys>
        <DataTable
          caption="Planets"
          rows={["Mars", "Venus"]}
          keyOf={(planet) => planet}
          name={{ key: "name", label: "Planet", cell: (planet) => (planet === "Mars" ? cell("Name of Mars", true) : planet) }}
          columns={[{ key: "moons", label: "Moons", cell: (planet) => (planet === "Mars" ? cell("Moons of Mars") : "0") }]}
        />
      </WithKeys>,
    );
    // No row to edit before the cursor is on one.
    key(document.body, "F2");
    expect(screen.queryByRole("textbox")).toBeNull();
    const mars = screen.getByRole("link", { name: "Mars" });
    mars.focus();
    key(mars, "F2");
    expect(screen.getByRole("textbox", { name: "Name of Mars" })).toHaveFocus();
    key(screen.getByRole("textbox", { name: "Name of Mars" }), "Escape");
    expect(screen.getByRole("link", { name: "Mars" })).toHaveFocus();
    const moonsButton = screen.getByRole("button", { name: "Moons of Mars: x" });
    moonsButton.focus();
    key(moonsButton, "F2");
    expect(screen.getByRole("textbox", { name: "Moons of Mars" })).toHaveFocus();
    key(screen.getByRole("textbox", { name: "Moons of Mars" }), "Escape");
    const venus = within(screen.getByRole("table")).getAllByRole("row")[2]!;
    fireEvent.focusIn(within(venus).getByRole("rowheader"));
    (document.activeElement as HTMLElement).blur();
    key(document.body, "F2");
    expect(screen.queryByRole("textbox")).toBeNull();
    key(document.body, "j");
    key(document.body, "k");
    (document.activeElement as HTMLElement).blur();
    key(document.body, "F2");
    expect(screen.getByRole("textbox", { name: "Name of Mars" })).toHaveFocus();
  });
});
