import { describe, expect, it, vi } from "vitest";
import { useState } from "preact/hooks";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { ActionsMenu, MenuItem } from "@solid-memo/ui/ActionsMenu";
import { BulkBar } from "./BulkBar";
import { WithKeys } from "../../test/keys";

/** A bar of `count` rows selected, with a menu first, a button first, or nothing to do. */
function Harness({ count, actions, onClear = vi.fn() }: { count: number; actions: "menu" | "button" | "none"; onClear?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <WithKeys>
      <BulkBar label="Selected planets" count={count} said={`${count} planets selected`} onClear={onClear}>
        {actions === "menu" && (
          <ActionsMenu label="Edit the selected planets" text="Edit" buttonClass="" open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
            <MenuItem onSelect={vi.fn()}>Rename</MenuItem>
          </ActionsMenu>
        )}
        {actions === "button" && <button type="button">Explore</button>}
      </BulkBar>
    </WithKeys>
  );
}

const key = (name: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key: name });

describe("BulkBar", () => {
  it("shows nothing while no row is selected, but says so", () => {
    render(<Harness count={0} actions="button" />);
    expect(screen.queryByRole("group", { name: "Selected planets" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("0 planets selected");
    // Nothing to open.
    key(".");
    expect(document.body).toHaveFocus();
  });

  it("counts the rows selected, offers what can be done with them, and clears them", () => {
    const onClear = vi.fn();
    render(<Harness count={2} actions="button" onClear={onClear} />);
    const bar = screen.getByRole("group", { name: "Selected planets" });
    expect(bar).toHaveTextContent("2 planets selected");
    expect(screen.getByRole("status")).toHaveTextContent("2 planets selected");
    expect(within(bar).getAllByRole("button").map((button) => button.textContent)).toEqual(["Explore", "Clear selection"]);
    fireEvent.click(within(bar).getByRole("button", { name: "Clear selection" }));
    expect(onClear).toHaveBeenCalled();
  });

  it("opens its first menu with ., or goes to its first button, and leaves other keys", () => {
    const { unmount } = render(<Harness count={1} actions="menu" />);
    key("x");
    expect(screen.queryByRole("menu")).toBeNull();
    key(".");
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();
    unmount();
    render(<Harness count={1} actions="button" />);
    key(".");
    expect(screen.getByRole("button", { name: "Explore" })).toHaveFocus();
  });

  it("takes no . with nothing to do", () => {
    render(<Harness count={1} actions="none" />);
    const event = new KeyboardEvent("keydown", { key: ".", bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
