// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { DataLink, LicenseLink } from "./DataLink";
import { I18nProvider } from "./i18n";

/** The link as the app renders it, in a paragraph of its own. */
function rendered(link: ComponentChildren) {
  return render(
    <I18nProvider locale="en" onChoose={() => undefined}>
      <p>{link}</p>
    </I18nProvider>,
  ).container.querySelector("p")!;
}

/** The host shown beside the link, if any. */
function shownHost(p: HTMLElement): string | null {
  return p.querySelector(".md-link-host")?.textContent ?? null;
}

describe("DataLink", () => {
  it("shows an address as itself, left to right, with no host beside it", () => {
    const p = rendered(<DataLink url="http://xmlns.com/foaf/spec/" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "http://xmlns.com/foaf/spec/");
    expect(link).toHaveAttribute("dir", "ltr");
    expect(shownHost(p)).toBeNull();
  });

  it("shows the host beside a title, which may read as any address", () => {
    const p = rendered(
      <DataLink
        url="https://evil.example/"
        label="https://en.wikipedia.org/wiki/List_of_national_capitals"
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://evil.example/");
    expect(shownHost(p)).toBe(" (evil.example)");
  });

  it("shows the host of an address written so that it opens another host", () => {
    const p = rendered(
      <DataLink url="https://en.wikipedia.org%2E%65%76%69%6C%2E%63%6F%6D/wiki/" />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://en.wikipedia.org.evil.com/wiki/",
    );
    expect(shownHost(p)).toBe(" (en.wikipedia.org.evil.com)");
  });

  it("shows the hidden characters of its text", () => {
    rendered(<DataLink url="https://example.org/" label={"Capitals‮gnp.exe"} />);
    expect(screen.getByRole("link")).toHaveTextContent("Capitals⟨U+202E⟩gnp.exe");
  });

  it.each([
    "mailto:a@example.org",
    "https://en.wikipedia.org@evil.example/",
    "javascript:alert(1)",
    "not an address",
  ])("leaves %s as text", (url) => {
    const p = rendered(<DataLink url={url} label="List of national capitals" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(p).toHaveTextContent("List of national capitals");
  });
});

describe("LicenseLink", () => {
  it("names a well-known license, with no host beside it", () => {
    const p = rendered(<LicenseLink url="https://creativecommons.org/licenses/by/4.0/" />);
    expect(screen.getByRole("link")).toHaveTextContent("CC BY 4.0");
    expect(shownHost(p)).toBeNull();
  });

  it("shows any other license as its address, with the host it opens", () => {
    const p = rendered(
      <LicenseLink url="https://creativecommons.org%2Eevil.example/licenses/by/4.0/" />,
    );
    expect(screen.getByRole("link")).toHaveTextContent(
      "https://creativecommons.org%2Eevil.example/licenses/by/4.0/",
    );
    expect(shownHost(p)).toBe(" (creativecommons.org.evil.example)");
  });
});
