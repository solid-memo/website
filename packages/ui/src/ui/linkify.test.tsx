// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { I18nProvider } from "./i18n";
import { linkify } from "./linkify";

/** The text linkified, as the app renders it, in a paragraph of its own. */
function rendered(text: string) {
  return render(
    <I18nProvider locale="en" onChoose={() => undefined}>
      <p>{linkify(text)}</p>
    </I18nProvider>,
  ).container.querySelector("p")!;
}

describe("linkify", () => {
  it("links an https address in running text, left to right, without the punctuation after it", () => {
    const p = rendered("From https://example.org/data, under a license.");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.org/data");
    expect(link).toHaveAttribute("dir", "ltr");
    expect(link).toHaveAccessibleName("https://example.org/data (opens in a new tab)");
    expect(p.querySelector(".md-link-host")).toBeNull();
    expect(p).toHaveTextContent(
      "From https://example.org/data (opens in a new tab), under a license.",
    );
  });

  it.each([
    "http://example.org/",
    "https://user@example.org/",
    "https://bank.example:secret@evil.example/",
  ])("leaves %s as text, as a Markdown link would be", (url) => {
    const p = rendered(`See ${url} now`);
    expect(screen.queryByRole("link")).toBeNull();
    expect(p).toHaveTextContent(`See ${url} now`);
  });

  it("shows the host of an address written so that it opens another host", () => {
    const p = rendered(
      "https://login.bank.example%2E%65%76%69%6C%2E%63%6F%6D/ and https://bank.example。evil.com/",
    );
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "https://login.bank.example.evil.com/",
      "https://bank.example.evil.com/",
    ]);
    expect([...p.querySelectorAll(".md-link-host")].map((host) => host.textContent)).toEqual([
      " (login.bank.example.evil.com)",
      " (bank.example.evil.com)",
    ]);
  });

  it("shows the hidden characters of an address, and the host it leads to", () => {
    const p = rendered("https://example.org/‮gnp.exe");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.org/%E2%80%AEgnp.exe");
    expect(link).toHaveTextContent("https://example.org/⟨U+202E⟩gnp.exe");
    expect(p.querySelector(".md-link-host")).toHaveTextContent("(example.org)");
  });
});
