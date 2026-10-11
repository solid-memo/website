import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { Footer, type SiteSource } from "./Footer";

const sha = "8faa7e1bd2e6de2b6570d692fd2865bb4b3217ad";
const source: SiteSource = { repoUrl: "https://git.example/memo", version: "0.1.0", commitSha: sha };

/** The footer's link named `name`, which opens in a new tab. */
function externalLink(name: string): HTMLElement {
  const link = screen.getByRole("link", { name: `${name} (opens in a new tab)` });
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  return link;
}

describe("Footer", () => {
  it("credits antwika as the creator, linking to their profile", () => {
    render(<Footer source={source} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Created by antwika");
    expect(externalLink("antwika")).toHaveAttribute("href", "https://github.com/antwika");
  });

  it("shows the version and the build's commit, linking to the commit in the repository", () => {
    render(<Footer source={source} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Version 0.1.0 (8faa7e1");
    const link = externalLink("8faa7e1");
    expect(link).toHaveAttribute("href", `https://git.example/memo/commit/${sha}`);
    expect(link).toHaveAttribute("title", sha);
  });

  it("shows the version alone when the build's commit is unknown", () => {
    render(<Footer source={{ ...source, commitSha: null }} />);
    expect(screen.getByRole("contentinfo")).toHaveTextContent("Version 0.1.0");
    expect(screen.getByRole("contentinfo")).not.toHaveTextContent("Version 0.1.0 (");
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("links to the source code and to a new issue in the repository", () => {
    render(<Footer source={source} />);
    expect(externalLink("Source code")).toHaveAttribute("href", "https://git.example/memo");
    expect(externalLink("Report an issue")).toHaveAttribute("href", "https://git.example/memo/issues/new/choose");
  });
});
