// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it, vi } from "vitest";
import { navigate } from "./oidcBrowser";

it("sends the browser to the provider", () => {
  const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
  navigate("https://idp.example/authorize?state=s");
  expect(assign).toHaveBeenCalledWith("https://idp.example/authorize?state=s");
});
