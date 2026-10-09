import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { useState } from "preact/hooks";
import { ActionsMenu, MENU_EDGE, MENU_GAP, MenuGroup, MenuItem, MenuLink, MenuSeparator, placeMenu } from "./ActionsMenu";

function Harness({ onFirst, onLast }: { onFirst: () => void; onLast: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button">before</button>
      <ActionsMenu label="Actions for Kana" buttonClass="row-menu" open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
        <MenuLink href="#/elsewhere">Preferences</MenuLink>
        <MenuItem onSelect={onFirst}>Rename</MenuItem>
        <MenuItem disabled onSelect={onFirst}>
          Move up
        </MenuItem>
        <MenuSeparator />
        <MenuGroup label="Move into">
          <MenuItem style="--depth: 1" onSelect={onFirst}>
            Grammar
          </MenuItem>
        </MenuGroup>
        <MenuItem danger onSelect={onLast}>
          Delete
        </MenuItem>
      </ActionsMenu>
      <button type="button">after</button>
    </>
  );
}

function renderMenu() {
  const onFirst = vi.fn();
  const onLast = vi.fn();
  render(<Harness onFirst={onFirst} onLast={onLast} />);
  return { onFirst, onLast, button: screen.getByRole("button", { name: "Actions for Kana" }) };
}

const menu = () => screen.queryByRole("menu");
const item = (name: string) => screen.getByRole("menuitem", { name });

describe("ActionsMenu", () => {
  it("is a menu button, closed at first, its icon decorative", () => {
    const { button } = renderMenu();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).not.toHaveAttribute("aria-controls");
    expect(button).toHaveAttribute("title", "Actions for Kana");
    expect(button).toHaveClass("icon", "row-menu");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(menu()).toBeNull();
  });

  it("opens on a press, named by its button and laid over the page, on its first item", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    const opened = screen.getByRole("menu", { name: "Actions for Kana" });
    expect(button).toHaveAttribute("aria-controls", opened.id);
    expect(opened.parentElement).toBe(document.body);
    expect(opened).toHaveAttribute("data-no-drag");
    expect(item("Preferences")).toHaveFocus();
    expect(within(opened).getAllByRole("menuitem").map((each) => each.textContent)).toEqual([
      "Preferences",
      "Rename",
      "Move up",
      "Grammar",
      "Delete",
    ]);
    for (const each of within(opened).getAllByRole("menuitem")) expect(each).toHaveAttribute("tabindex", "-1");
    expect(within(opened).getByRole("separator")).toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "Move into" })).getByRole("menuitem")).toHaveTextContent("Grammar");
    expect(item("Grammar").style.getPropertyValue("--depth")).toBe("1");
    expect(item("Delete")).toHaveClass("danger");
    expect(item("Rename")).not.toHaveClass("danger");
  });

  it("closes on a press of its button, focus back on the button, which not every browser focuses as it is pressed", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    expect(item("Preferences")).toHaveFocus();
    fireEvent.click(button);
    expect(menu()).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it.each([
    ["ArrowDown", "Preferences"],
    ["ArrowUp", "Delete"],
  ])("opens on %s, on that end's item", (key, focused) => {
    const { button } = renderMenu();
    fireEvent.keyDown(button, { key });
    expect(item(focused)).toHaveFocus();
  });

  it("opens on no other key", () => {
    const { button } = renderMenu();
    fireEvent.keyDown(button, { key: "a" });
    expect(menu()).toBeNull();
  });

  it("goes round its items with the arrows, to either end with Home and End, passing over no unavailable one", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    const key = (name: string) => fireEvent.keyDown(document.activeElement!, { key: name });
    key("ArrowUp");
    expect(item("Delete")).toHaveFocus();
    key("ArrowDown");
    expect(item("Preferences")).toHaveFocus();
    key("ArrowDown");
    key("ArrowDown");
    expect(item("Move up")).toHaveFocus();
    key("End");
    expect(item("Delete")).toHaveFocus();
    key("Home");
    expect(item("Preferences")).toHaveFocus();
    key("a");
    expect(item("Preferences")).toHaveFocus();
    expect(menu()).not.toBeNull();
  });

  it("closes on Escape, back on its button", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    fireEvent.keyDown(item("Rename"), { key: "Escape" });
    expect(menu()).toBeNull();
    expect(button).toHaveFocus();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Tab, from its button, for Tab to go on from there", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    const tab = fireEvent.keyDown(item("Rename"), { key: "Tab" });
    expect(tab).toBe(true);
    expect(menu()).toBeNull();
    expect(button).toHaveFocus();
  });

  it("closes on a press elsewhere, leaving focus there, but not on one in it", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    fireEvent.pointerDown(item("Rename"));
    expect(menu()).not.toBeNull();
    fireEvent.pointerDown(button);
    expect(menu()).not.toBeNull();
    fireEvent.pointerDown(screen.getByRole("button", { name: "after" }));
    expect(menu()).toBeNull();
    expect(button).not.toHaveFocus();
  });

  it("closes as an item is chosen, back on its button, then does what it does", () => {
    const { button, onFirst, onLast } = renderMenu();
    fireEvent.click(button);
    onLast.mockImplementation(() => expect(button).toHaveFocus());
    fireEvent.click(item("Delete"));
    expect(onLast).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
    expect(onFirst).not.toHaveBeenCalled();
  });

  it("closes as a link in it is followed", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    expect(item("Preferences")).toHaveAttribute("href", "#/elsewhere");
    fireEvent.click(item("Preferences"));
    expect(menu()).toBeNull();
    expect(button).toHaveFocus();
  });

  it("follows a link in it on Space too, rather than scrolling the page", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    const followed = vi.fn((event: Event) => event.preventDefault());
    item("Preferences").addEventListener("click", followed);
    expect(fireEvent.keyDown(item("Preferences"), { key: " " })).toBe(false);
    expect(followed).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
    expect(button).toHaveFocus();
  });

  it("leaves Space on an item that is a button to the button", () => {
    const { button, onFirst } = renderMenu();
    fireEvent.click(button);
    expect(fireEvent.keyDown(item("Rename"), { key: " " })).toBe(true);
    expect(onFirst).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it("marks an item that cannot be done now, keeps it focusable, and does nothing on it", () => {
    const { button, onFirst } = renderMenu();
    fireEvent.click(button);
    expect(item("Move up")).toHaveAttribute("aria-disabled", "true");
    expect(item("Rename")).not.toHaveAttribute("aria-disabled");
    fireEvent.click(item("Move up"));
    expect(onFirst).not.toHaveBeenCalled();
    expect(menu()).not.toBeNull();
  });

  it("places itself by its button, and again as the page scrolls or resizes, until it closes", () => {
    let bottom = 100;
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockImplementation(
      () => ({ top: bottom - 44, bottom, right: 300 }) as DOMRect,
    );
    // The viewport, less its scrollbars.
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(320);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(600);
    const { button } = renderMenu();
    fireEvent.click(button);
    const opened = menu()!;
    // The test DOM lays nothing out: the menu is 0 by 0 there.
    expect([opened.style.top, opened.style.left]).toEqual([`${100 + MENU_GAP}px`, "300px"]);
    // No larger than the viewport as shown.
    expect([opened.style.maxWidth, opened.style.maxHeight]).toEqual([
      `${320 - 2 * MENU_EDGE}px`,
      `${600 - 2 * MENU_EDGE}px`,
    ]);
    bottom = 200;
    fireEvent.scroll(window);
    expect(opened.style.top).toBe(`${200 + MENU_GAP}px`);
    bottom = 150;
    fireEvent(window, new Event("resize"));
    expect(opened.style.top).toBe(`${150 + MENU_GAP}px`);
    fireEvent.keyDown(item("Rename"), { key: "Escape" });
    fireEvent.scroll(window);
    expect(opened.style.top).toBe(`${150 + MENU_GAP}px`);
    vi.restoreAllMocks();
  });

  it.each([
    ["above the viewport", 0],
    ["below the viewport", 644],
  ])("closes, back on its button, once its button scrolls out of sight %s", (_, bottom) => {
    const rect = vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect");
    rect.mockReturnValue({ top: 56, bottom: 100, right: 300 } as DOMRect);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(600);
    const { button } = renderMenu();
    fireEvent.click(button);
    rect.mockReturnValue({ top: bottom - 44, bottom, right: 300 } as DOMRect);
    const focus = vi.spyOn(button, "focus");
    fireEvent.scroll(window);
    expect(menu()).toBeNull();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(button).toHaveFocus();
    vi.restoreAllMocks();
  });
});

describe("placeMenu", () => {
  const viewport = { width: 320, height: 600 };
  const size = { width: 200, height: 300 };

  it("puts the menu under its button, its right edge on the button's", () => {
    expect(placeMenu({ top: 56, bottom: 100, right: 300 }, size, viewport)).toEqual({ top: 100 + MENU_GAP, left: 100 });
  });

  it("keeps it inside the viewport's left and right edges", () => {
    expect(placeMenu({ top: 56, bottom: 100, right: 120 }, size, viewport).left).toBe(MENU_EDGE);
    expect(placeMenu({ top: 56, bottom: 100, right: 400 }, size, viewport).left).toBe(320 - MENU_EDGE - 200);
  });

  it("puts it above its button when there is no room below, and there is above", () => {
    expect(placeMenu({ top: 500, bottom: 544, right: 300 }, size, viewport).top).toBe(500 - MENU_GAP - 300);
  });

  it("keeps it inside the viewport when there is room on neither side", () => {
    expect(placeMenu({ top: 250, bottom: 294, right: 300 }, size, viewport).top).toBe(600 - MENU_EDGE - 300);
    expect(placeMenu({ top: 250, bottom: 294, right: 300 }, { width: 200, height: 700 }, viewport).top).toBe(MENU_EDGE);
  });
});
