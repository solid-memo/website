// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { Footer, type SiteSource } from "./Footer";
import { I18nProvider } from "./i18n";

const sha = "8faa7e1bd2e6de2b6570d692fd2865bb4b3217ad";
const source: SiteSource = {
  repoUrl: "https://git.example/memo",
  version: "0.1.0",
  commitSha: sha,
};

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
    expect(screen.getAllByRole("link")).toHaveLength(7);
  });

  it("links to the source code and to a new issue in the repository", () => {
    render(<Footer source={source} />);
    expect(externalLink("Source code")).toHaveAttribute("href", "https://git.example/memo");
    expect(externalLink("Report an issue")).toHaveAttribute(
      "href",
      "https://git.example/memo/issues/new/choose",
    );
  });

  it("links to the changelog on the repository's main branch", () => {
    render(<Footer source={source} />);
    expect(externalLink("Changelog")).toHaveAttribute(
      "href",
      "https://git.example/memo/blob/main/CHANGELOG.md",
    );
  });

  it("links to the repository's Discussions, for questions and open ideas", () => {
    render(<Footer source={source} />);
    expect(externalLink("Discussions")).toHaveAttribute(
      "href",
      "https://git.example/memo/discussions",
    );
  });

  it("links first to the About page, then to the docs, this site's own pages in English, in the same tab", () => {
    render(<Footer source={source} />);
    // Named "About" alone: no "(opens in a new tab)".
    const about = screen.getByRole("link", { name: "About" });
    expect(about.parentElement?.firstElementChild).toBe(about);
    expect(about).toHaveAttribute("href", "about/");
    expect(about).toHaveAttribute("hreflang", "en");
    expect(about).not.toHaveAttribute("target");
    const docs = screen.getByRole("link", { name: "Docs" });
    expect(about.nextElementSibling).toBe(docs);
    expect(docs.parentElement).toContainElement(externalLink("Source code"));
    expect(docs).toHaveAttribute("href", "docs/");
    expect(docs).toHaveAttribute("hreflang", "en");
    expect(docs).not.toHaveAttribute("target");
    expect(docs).not.toHaveAttribute("rel");
  });

  it("says in another language that the About page and the docs are in English", () => {
    render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <Footer source={source} />
      </I18nProvider>,
    );
    expect(screen.getByRole("link", { name: "Om appen (på engelska)" })).toHaveAttribute(
      "hreflang",
      "en",
    );
    const docs = screen.getByRole("link", { name: "Dokumentation (på engelska)" });
    expect(docs).toHaveAttribute("href", "docs/");
    expect(docs).toHaveAttribute("hreflang", "en");
  });
});
