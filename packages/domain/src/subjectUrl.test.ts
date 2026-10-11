// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { documentUrlOf, fragmentIdOf } from "./subjectUrl";

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
});
