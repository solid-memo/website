import { fireEvent, screen, within } from "@testing-library/preact";

/** Chooses an item of a menu (ActionsMenu), as a user does: the menu's button, by its name, then the item. */
export function pick(menu: string, item: string): void {
  fireEvent.click(screen.getByRole("button", { name: menu }));
  fireEvent.click(screen.getByRole("menuitem", { name: item }));
}

/** The dialog of this heading, open. */
export function dialog(heading: string): HTMLElement {
  return screen.getByRole("dialog", { name: heading });
}

/** Answers the question a dialog asks (ConfirmDialog), by its heading: with the button of this name. */
export function answer(heading: string, choice: string): void {
  fireEvent.click(within(dialog(heading)).getByRole("button", { name: choice }));
}
