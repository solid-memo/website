// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { canonicalTag, NO_LANGUAGE } from "./languageTag";

describe("a language tag", () => {
  it("is stored in lower case, in its canonical form", () => {
    expect(canonicalTag("sv")).toBe("sv");
    expect(canonicalTag("PT-br")).toBe("pt-br");
    expect(canonicalTag(" en-GB ")).toBe("en-gb");
    expect(canonicalTag("iw")).toBe("he");
    expect(canonicalTag("zh-Hant-TW")).toBe("zh-hant-tw");
  });

  it("may say the text is in no language", () => {
    expect(NO_LANGUAGE).toBe("zxx");
    expect(canonicalTag("ZXX")).toBe(NO_LANGUAGE);
  });

  it("is none when the input is not a well-formed tag", () => {
    expect(canonicalTag("")).toBeNull();
    expect(canonicalTag("   ")).toBeNull();
    expect(canonicalTag("sv_SE")).toBeNull();
    expect(canonicalTag("Swedish")).toBeNull();
    expect(canonicalTag("123")).toBeNull();
  });

  it("is none when it names no language: undetermined, an extension or private use", () => {
    expect(canonicalTag("und")).toBeNull();
    expect(canonicalTag("und-Latn")).toBeNull();
    expect(canonicalTag("en-u-ca-gregory")).toBeNull();
    expect(canonicalTag("de-t-en")).toBeNull();
    expect(canonicalTag("en-x-pirate")).toBeNull();
    expect(canonicalTag("x-klingon")).toBeNull();
  });
});
