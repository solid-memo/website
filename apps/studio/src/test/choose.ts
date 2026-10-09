import { fireEvent, screen } from "@testing-library/preact";

/**
 * Picks an option of the select named, as a user does. Not
 * fireEvent.change: once preact/compat is in play (react-query brings
 * it in), Testing Library fires "input" for it, which a select's
 * onChange never hears.
 */
export function choose(name: string, value: string): void {
  const select = screen.getByRole<HTMLSelectElement>("combobox", { name });
  select.value = value;
  fireEvent(select, new Event("change", { bubbles: true }));
}
