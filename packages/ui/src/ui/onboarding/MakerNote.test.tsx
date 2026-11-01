// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { MakerNote } from "./MakerNote";

describe("MakerNote", () => {
  it("quotes the maker's goal, signed, with no link away from the landing", () => {
    render(<MakerNote />);
    expect(screen.getByRole("blockquote")).toHaveTextContent(
      /^My goal is for Solid Memo to be a high-quality app in the Solid ecosystem\. .* with an open governance structure\.$/,
    );
    expect(screen.getByText("— Anton Wiklund")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
