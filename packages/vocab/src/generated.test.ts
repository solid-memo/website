// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { INVALID_DATA_POLICIES, STUDY_DIRECTIONS, TOPICS } from "./concepts.generated";
import { ALL_SHAPES, SHAPES } from "./descriptors.generated";
import { LATEST_VERSION } from "./types.generated";
import { SM, SM_NS } from "./vocab.generated";

/**
 * The generated modules are data only; tooling/generate.test.ts holds
 * them to their sources. Loading them here is what the other packages do.
 */
describe("the generated modules", () => {
  it("name the vocabulary's terms under its namespace", () => {
    expect(Object.values(SM).every((iri) => iri.startsWith(SM_NS))).toBe(true);
  });

  it("describe every shape at its latest version", () => {
    for (const [shape, version] of Object.entries(LATEST_VERSION)) {
      expect(
        ALL_SHAPES.some((d) => d.shape === shape && d.version === version),
        shape,
      ).toBe(true);
    }
    expect(Object.keys(SHAPES).sort()).toEqual(Object.keys(LATEST_VERSION).sort());
  });

  it("hold each concept scheme's concepts", () => {
    for (const scheme of [STUDY_DIRECTIONS, INVALID_DATA_POLICIES, TOPICS]) {
      expect(scheme.concepts.length).toBeGreaterThan(0);
    }
  });
});
