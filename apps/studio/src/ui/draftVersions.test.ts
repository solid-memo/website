// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { courseDraft, DRAFT_URL } from "../test/fixtures";
import { markdownCheckOf, revisionOf } from "./draftVersions";

describe("markdownCheckOf", () => {
  it("keeps the last draft's Markdown check only, a new one for another draft", () => {
    const first = markdownCheckOf(DRAFT_URL);
    expect(markdownCheckOf(DRAFT_URL)).toBe(first);
    const other = markdownCheckOf("https://pod.example/drafts/other/");
    expect(other).not.toBe(first);
    expect(markdownCheckOf(DRAFT_URL)).not.toBe(first);
  });
});

describe("revisionOf", () => {
  it("numbers each version of a draft once, a newer one higher", () => {
    const first = courseDraft();
    const second = courseDraft();
    expect(revisionOf(first)).toBe(revisionOf(first));
    expect(revisionOf(second)).toBeGreaterThan(revisionOf(first));
  });
});
