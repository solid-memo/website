// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { documentUrlOf, fragmentIdOf, isSameDocument } from "./subjectUrl";

describe("subject URLs", () => {
  it("split a subject URL into its document and fragment", () => {
    expect(fragmentIdOf("https://pod.example/catalog.ttl#deck-1")).toBe("deck-1");
    expect(documentUrlOf("https://pod.example/catalog.ttl#deck-1")).toBe(
      "https://pod.example/catalog.ttl",
    );
    expect(documentUrlOf("https://pod.example/catalog.ttl")).toBe(
      "https://pod.example/catalog.ttl",
    );
  });

  it("tell subjects of the same document, the document's own URL among them, from those of another", () => {
    const doc = "https://pod.example/catalog.ttl";
    expect(isSameDocument(`${doc}#deck-1`, `${doc}#catalog`)).toBe(true);
    expect(isSameDocument(doc, `${doc}#catalog`)).toBe(true);
    expect(isSameDocument(`${doc}#catalog`, doc)).toBe(true);
    expect(isSameDocument("https://pod.example/other.ttl#deck-1", `${doc}#catalog`)).toBe(false);
    expect(isSameDocument(`${doc}.acl`, doc)).toBe(false);
  });
});
