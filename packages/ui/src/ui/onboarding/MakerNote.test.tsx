// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { MakerNote } from "./MakerNote";

describe("MakerNote", () => {
  it("quotes the maker's reasons, signed, with the way to the full note on the About page", () => {
    render(<MakerNote />);
    const points = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(points).toEqual([
      "A high-quality app for Solid: I want it to show what Solid can do.",
      "For a broad audience: flashcards suit anyone who wants to learn.",
      "Private and secure: your data stays with you, not with me, and I work to keep the app secure.",
      "Free: hosting is mostly free, with no servers to run. It takes my time and effort.",
      "Open source: anyone can read, change and run the code.",
    ]);
    expect(screen.getByText("— Anton Wiklund")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Read why I made it" });
    expect(link).toHaveAttribute("href", "about/#why");
    expect(link).toHaveAttribute("hreflang", "en");
  });
});
