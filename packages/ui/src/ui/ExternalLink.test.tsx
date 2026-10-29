// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { ExternalLink } from "./ExternalLink";

describe("ExternalLink", () => {
  it("links a URL, labeled with the URL itself, in a new tab it says it opens", () => {
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

  it("labels a mailto: link with no text of its own with its address", () => {
    render(<ExternalLink url="mailto:anton@example.org" />);
    expect(screen.getByRole("link", { name: "mailto:anton@example.org" })).toHaveAttribute(
      "href",
      "mailto:anton@example.org",
    );
  });

  it("renders an unsafe URL as plain text, never as a link", () => {
    render(<ExternalLink url="javascript:alert(1)" class="hint" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("javascript:alert(1)")).toHaveClass("hint");
  });

  it("shows the hidden characters of an address it reads as markers", () => {
    render(<ExternalLink url={"https://pod.example/\u202Ekcab/x"} />);
    const link = screen.getByRole("link", {
      name: "https://pod.example/⟨U+202E⟩kcab/x (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://pod.example/\u202Ekcab/x");
  });

  it.each([
    [
      "https://pod.example\u2215decks.evil.example/x",
      "https://pod.xn--exampledecks-ni5g.evil.example/x",
    ],
    ["https://b\u0430nk.example/", "https://xn--bnk-6cd.example/"],
  ])("reads %j, whose text names another host, as the parser has it", (url, shown) => {
    render(<ExternalLink url={url} />);
    const link = screen.getByRole("link", { name: `${shown} (opens in a new tab)` });
    expect(link).toHaveAttribute("href", url);
  });

  it("never links an address with a user name before its host", () => {
    const url = "https://pod.example\u2215card@evil.example/x";
    render(<ExternalLink url={url} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(url)).toBeInTheDocument();
  });
});
