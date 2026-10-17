// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { mistakeReportUrl } from "./mistakeReport";

const REPO = "https://github.com/solid-memo/website";
const RELEASE = "https://solid-memo.com/decks/capitals-of-the-world/v2.ttl";

/** The query of a link, as the form reads it. */
function fieldsOf(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams);
}

describe("mistakeReportUrl", () => {
  it("opens the repository's deck form for a library release, with the release and the card filled in", () => {
    const url = mistakeReportUrl({ library: true }, REPO, RELEASE, "sweden")!;
    expect(url.startsWith(`${REPO}/issues/new?`)).toBe(true);
    expect(fieldsOf(url)).toEqual({
      template: "deck.yml",
      deck: RELEASE,
      details: `Card: ${RELEASE}#sweden\n\nWhat is wrong, and what should it say instead?`,
    });
  });

  it("names no card when the release as a whole is reported", () => {
    expect(fieldsOf(mistakeReportUrl({ library: true }, REPO, RELEASE)!).details).toBe(
      "What is wrong, and what should it say instead?",
    );
  });

  it("has nowhere to report a library release when no repository is known", () => {
    expect(mistakeReportUrl({ library: true }, null, RELEASE, "sweden")).toBeNull();
  });

  it("links a release from a link to its contact's web page, never to the library's tracker", () => {
    const contact = "https://example.org/my-decks/issues";
    expect(mistakeReportUrl({ library: false, contact }, REPO, RELEASE, "sweden")).toBe(contact);
  });

  it("has nowhere to report a release from a link with no web page for a contact", () => {
    expect(mistakeReportUrl({ library: false }, REPO, RELEASE, "sweden")).toBeNull();
    expect(
      mistakeReportUrl({ library: false, contact: "mailto:bo@example.org" }, REPO, RELEASE),
    ).toBeNull();
  });
});
