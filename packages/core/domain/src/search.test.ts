// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { matchesQuery, searchForm } from "./search";

const SARAM_NFC = "사람";
const SARAM_NFD = SARAM_NFC.normalize("NFD");
const CAFE_NFD = "Café";

describe("searchForm", () => {
  it("is the text composed, in lower case", () => {
    expect(SARAM_NFD).toHaveLength(5);
    expect(searchForm(SARAM_NFD)).toBe(SARAM_NFC);
    expect(searchForm(CAFE_NFD)).toBe("café");
  });

  it("folds Arabic, and only Arabic", () => {
    expect(searchForm("المَدِينَة")).toBe("المدينه");
    expect(searchForm("Café")).toBe("café");
  });
});

describe("matchesQuery", () => {
  it("matches every text when the query is empty or spaces", () => {
    expect(matchesQuery([], "  ")).toBe(true);
    expect(matchesQuery(["Capitals"], "")).toBe(true);
  });

  it("matches a text that contains the query, whatever the case", () => {
    expect(matchesQuery(["Capitals", "Every country's capital."], " COUNTRY ")).toBe(true);
    expect(matchesQuery(["Capitals"], "rivers")).toBe(false);
  });

  it("matches a decomposed query against composed text, and the other way round", () => {
    expect(matchesQuery([`${SARAM_NFC}, 명사`], SARAM_NFD)).toBe(true);
    expect(matchesQuery([SARAM_NFD], SARAM_NFC)).toBe(true);
    expect(matchesQuery(["Café words"], CAFE_NFD.toLowerCase())).toBe(true);
    expect(matchesQuery([CAFE_NFD], "café")).toBe(true);
  });

  it("finds Arabic written with or without its vowels", () => {
    expect(matchesQuery(["كِتَاب"], "كتاب")).toBe(true);
    expect(matchesQuery(["أكل"], "اكل")).toBe(true);
    expect(matchesQuery(["كتاب"], "كِتَاب")).toBe(true);
  });
});
