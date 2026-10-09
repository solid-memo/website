import { screen } from "@testing-library/preact";

/**
 * What the screen's alerts and status lines say. They stay mounted, empty
 * while there is nothing to say, so a test asks what is said rather than
 * whether one is there.
 */
export function alertTexts(): string[] {
  return spoken("alert");
}

export function statusTexts(): string[] {
  return spoken("status");
}

function spoken(role: "alert" | "status"): string[] {
  return screen
    .queryAllByRole(role)
    .map((element) => element.textContent ?? "")
    .filter((text) => text !== "");
}

/** What an English page says of an error the app has no words of its own for. */
export function unexpectedText(detail: string): string {
  return `Something went wrong. Try again, or reload the page. Details: ${detail}`;
}
