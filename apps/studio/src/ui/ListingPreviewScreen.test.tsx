import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import { courseDraft } from "../test/fixtures";
import { ListingPreviewScreen } from "./ListingPreviewScreen";

describe("ListingPreviewScreen", () => {
  it("shows the draft's row in the library and its page, as learners will see them, inert", () => {
    render(<ListingPreviewScreen draft={courseDraft()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Listing preview" })).toBeInTheDocument();
    const previews = document.querySelectorAll(".listing-preview");
    expect(previews).toHaveLength(2);
    for (const preview of previews) expect(preview).toHaveAttribute("inert");
    // Hidden from assistive technology as inert, so read from the markup.
    const row = previews[0] as HTMLElement;
    expect(row.querySelector(".library-deck-name")).toHaveTextContent("Solid");
    expect(row.querySelector(".library-course")).toHaveTextContent("Course");
    expect(row).toHaveTextContent("2 cards");
    const page = previews[1] as HTMLElement;
    expect(page.querySelector("h2")).toHaveTextContent("Solid");
    // Pressing what is there does nothing.
    fireEvent.click(within(page).getByText("Start course"));
    expect(screen.getByRole("heading", { level: 2, name: "Listing preview" })).toBeInTheDocument();
  });
});
