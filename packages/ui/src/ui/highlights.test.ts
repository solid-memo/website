// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { HIGHLIGHTS } from "./highlights";

// Each highlight's text in every language is held by the message files' test (i18n.test.tsx).
describe("the highlights", () => {
  const ids = HIGHLIGHTS.map(({ id }) => id);

  it("are each told apart by an id of their own", () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("have kebab-case ids", () => {
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([]);
  });

  it("each say their text under whatsNew.highlight, by their id in camelCase", () => {
    const misnamed = HIGHLIGHTS.filter(
      ({ id, text }) =>
        text !==
        `whatsNew.highlight.${id.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())}`,
    );
    expect(misnamed).toEqual([]);
  });
});
