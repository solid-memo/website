import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ExternalLink } from "./ExternalLink";

describe("ExternalLink", () => {
  it("links a URL, labelled with the URL itself, in a new tab it says it opens", () => {
    render(<ExternalLink url="https://alice.example/profile/card#me" />);
    const link = screen.getByRole("link", {
      name: "https://alice.example/profile/card#me (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://alice.example/profile/card#me");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("(opens in a new tab)")).toHaveClass("visually-hidden");
  });

  it("accepts custom link text, a class and a title", () => {
    render(
      <ExternalLink url="https://pod.example/" class="hint" title="Your pod">
        my pod
      </ExternalLink>,
    );
    const link = screen.getByRole("link", { name: "my pod (opens in a new tab)" });
    expect(link).toHaveAttribute("href", "https://pod.example/");
    expect(link).toHaveClass("hint");
    expect(link).toHaveAttribute("title", "Your pod");
  });

  it("opens a mailto: link where it is, with no new tab to announce", () => {
    render(<ExternalLink url="mailto:anton@example.org">Anton</ExternalLink>);
    const link = screen.getByRole("link", { name: "Anton" });
    expect(link).toHaveAttribute("href", "mailto:anton@example.org");
    expect(link).not.toHaveAttribute("target");
    expect(link.querySelector("svg")).toBeNull();
  });

  it("renders an unsafe URL as plain text, never as a link", () => {
    render(<ExternalLink url="javascript:alert(1)" class="hint" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toHaveClass("hint");
  });
});
