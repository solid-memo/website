import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { answer, dialog, pick } from "../../test/dialogs";
import { SavedViews } from "./SavedViews";
import type { SavedView } from "./views";

const due: SavedView = { name: "Due", params: "show=due" };
const kanji: SavedView = { name: "Kanji", params: "q=kanji" };

function renderViews(current = "show=due") {
  const onApply = vi.fn();
  const onViews = vi.fn();
  render(<SavedViews views={[due, kanji]} current={current} onApply={onApply} onViews={onViews} />);
  return { onApply, onViews };
}

/** Names the view in the dialog asking for a name (by its heading), and saves it. */
function name(heading: string, text: string) {
  const asked = dialog(heading);
  fireEvent.input(within(asked).getByRole("textbox", { name: "Name" }), { target: { value: text } });
  fireEvent.click(within(asked).getByRole("button", { name: "Save" }));
}

describe("SavedViews", () => {
  it("shows each view, the one the table is in pressed, and puts the table in one chosen", () => {
    const { onApply } = renderViews();
    expect(screen.getByRole("button", { name: "Due" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Kanji" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Kanji" }));
    expect(onApply).toHaveBeenCalledWith("q=kanji");
  });

  it("saves the table's query under a name, asked in a dialog, but not under none", () => {
    const { onViews } = renderViews("q=verbs");
    fireEvent.click(screen.getByRole("button", { name: "+ Save view" }));
    expect(within(dialog("Save the view")).getByText("A view of the same name is replaced.")).toBeInTheDocument();
    name("Save the view", "  ");
    expect(onViews).not.toHaveBeenCalled();
    name("Save the view", " Verbs ");
    expect(onViews).toHaveBeenCalledWith([due, kanji, { name: "Verbs", params: "q=verbs" }]);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Save view" }));
    fireEvent.click(within(dialog("Save the view")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "+ Save view" }));
    fireEvent.click(within(dialog("Save the view")).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renames a view from its menu, its name to start with", () => {
    const { onViews } = renderViews();
    pick("Options of the view Kanji", "Rename…");
    expect(within(dialog("Rename the view Kanji")).getByRole("textbox", { name: "Name" })).toHaveValue("Kanji");
    name("Rename the view Kanji", "Kanji N5");
    expect(onViews).toHaveBeenCalledWith([due, { ...kanji, name: "Kanji N5" }]);
  });

  it("removes a view from its menu, once the user confirms", () => {
    const { onViews } = renderViews();
    pick("Options of the view Due", "Remove");
    expect(dialog("Remove the view")).toHaveTextContent("Remove the view Due? Only the view goes: nothing in your Pod changes.");
    answer("Remove the view", "Remove");
    expect(onViews).toHaveBeenCalledWith([kanji]);
  });
});
