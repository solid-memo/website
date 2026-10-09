import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { LibraryCardScreen } from "./LibraryCardScreen";

describe("LibraryCardScreen", () => {
  it("shows both sides, read-only, and links the deck", () => {
    const { container } = render(
      <LibraryCardScreen
        card={{
          id: "sweden",
          front: { "": "Sweden" },
          back: { "": "Stockholm" },
          backImageUrl: "https://flagcdn.com/se.svg",
          formatVersion: 1,
        }}
        deckName="Capitals"
        deckHref="#/library-deck?deck=capitals"
      />,
    );
    expect(screen.getByRole("heading", { name: "Card" })).toBeInTheDocument();
    expect(container.querySelector(".card-front")).toHaveTextContent("Sweden");
    expect(container.querySelector(".card-back")).toHaveTextContent("Stockholm");
    expect(container.querySelector(".card-back img")).toHaveAttribute("src", "https://flagcdn.com/se.svg");
    expect(screen.getByRole("link", { name: "Capitals" })).toHaveAttribute(
      "href",
      "#/library-deck?deck=capitals",
    );
    // The one button is the picture's, which enlarges it.
    expect(screen.getAllByRole("button").map((button) => button.getAttribute("class"))).toEqual(["picture-zoom-button"]);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("says a retired card is no longer studied", () => {
    render(
      <LibraryCardScreen
        card={{ id: "yu", front: { "": "Yugoslavia" }, back: { "": "Belgrade" }, formatVersion: 3, retired: true }}
        deckName="Capitals"
        deckHref="#/library-deck?deck=capitals"
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent("This card is retired");
  });
});
