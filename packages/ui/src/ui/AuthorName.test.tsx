// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AuthorName, AuthorNames } from "./AuthorName";
import { LIST_LIMIT } from "./bounded";

describe("AuthorName", () => {
  it("links a name to its address", () => {
    const { container } = render(<AuthorName author="Anton Wiklund <anton@example.com>" />);
    expect(container.textContent).toBe("Anton Wiklund");
    expect(screen.getByRole("link", { name: "Anton Wiklund" })).toHaveAttribute(
      "href",
      "mailto:anton@example.com",
    );
  });

  it("shows an address with header fields as plain text", () => {
    const author = "Support <help@example.org?cc=someone%40example.net&subject=Hello>";
    const { container } = render(<AuthorName author={author} />);
    expect(container.textContent).toBe(author);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows a name without an address as plain text", () => {
    const { container } = render(<AuthorName author="Anton Wiklund" />);
    expect(container.textContent).toBe("Anton Wiklund");
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("AuthorNames", () => {
  it("separates several authors with commas, linking those with an address", () => {
    const { container } = render(
      <AuthorNames authors={["Anton Wiklund <anton@example.com>", "A friend"]} />,
    );
    expect(container.textContent).toBe("Anton Wiklund, A friend");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("names the first of many authors, then how many more there are (GHSA-46q4-pmpc-mj5j)", () => {
    const authors = Array.from({ length: 2_000 }, (_, i) => `Author ${i}`);
    const { container } = render(<AuthorNames authors={authors} />);
    expect(container.textContent).toBe(
      `${authors.slice(0, LIST_LIMIT).join(", ")} and ${(2_000 - LIST_LIMIT).toLocaleString("en")} more`,
    );
  });

  it("counts the more there are from all the authors named, when it has only the first of them", () => {
    const authors = Array.from({ length: 100 }, (_, i) => `Author ${i}`);
    const { container } = render(<AuthorNames authors={authors} count={5_000} />);
    expect(container.textContent).toBe(
      `${authors.slice(0, LIST_LIMIT).join(", ")} and ${(5_000 - LIST_LIMIT).toLocaleString("en")} more`,
    );
  });
});
