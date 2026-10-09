import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { AuthorName, AuthorNames } from "./AuthorName";

describe("AuthorName", () => {
  it("links a name to its address", () => {
    const { container } = render(
      <AuthorName author="Anton Wiklund <anton@example.com>" />,
    );
    expect(container.textContent).toBe("Anton Wiklund");
    expect(screen.getByRole("link", { name: "Anton Wiklund" })).toHaveAttribute(
      "href",
      "mailto:anton@example.com",
    );
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
});
