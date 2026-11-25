// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import { instanceName } from "./instance";

describe("instanceName", () => {
  it("trims the name, and refuses an empty one", () => {
    expect(instanceName("  Languages ")).toBe("Languages");
    expect(() => instanceName(" ")).toThrow(new AppError("instanceNameEmpty"));
  });
});
