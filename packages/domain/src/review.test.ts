// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { reviewKeyOf } from "./review";

describe("reviewKeyOf", () => {
  it("tells the two directions of one card apart", () => {
    expect(reviewKeyOf({ cardId: "sweden", direction: "front-to-back" })).toBe(
      "front-to-back/sweden",
    );
    expect(reviewKeyOf({ cardId: "sweden", direction: "back-to-front" })).toBe(
      "back-to-front/sweden",
    );
  });
});
