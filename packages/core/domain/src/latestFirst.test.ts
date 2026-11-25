// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { latestFirst } from "./latestFirst";

it("puts the item used first, once, and keeps at most the limit", () => {
  expect(latestFirst(["a", "b", "c"], "b", 3)).toEqual(["b", "a", "c"]);
  expect(latestFirst(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  expect(latestFirst([], "a", 2)).toEqual(["a"]);
});

it("takes the items `same` names as one for the same", () => {
  const same = (a: { id: string }, b: { id: string }) => a.id === b.id;
  expect(latestFirst([{ id: "a" }, { id: "b" }], { id: "b" }, 5, same)).toEqual([
    { id: "b" },
    { id: "a" },
  ]);
});
