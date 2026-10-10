import { describe, expect, it } from "vitest";
import { localeOf, pickLocale } from "./locale";

describe("localeOf", () => {
  it.each([
    ["en", "en"],
    ["sv", "sv"],
    ["sv-SE", "sv"],
    ["EN-gb", "en"],
    ["ko", "ko"],
    ["ko-KR", "ko"],
    ["de-AT", "de"],
    ["es-419", "es"],
    ["fr-CA", "fr"],
  ])("names %s as %s", (tag, locale) => {
    expect(localeOf(tag)).toBe(locale);
  });

  it("is null for a language the app does not speak", () => {
    expect(localeOf("fi-FI")).toBeNull();
  });
});

describe("pickLocale", () => {
  it("speaks the user's choice above all", () => {
    expect(pickLocale("en", ["sv-SE"])).toBe("en");
  });

  it("else speaks the first preferred language it can", () => {
    expect(pickLocale(null, ["fi", "sv-SE", "en"])).toBe("sv");
    expect(pickLocale(null, ["fi", "ko-KR", "en"])).toBe("ko");
    expect(pickLocale(null, ["ja", "de-CH", "en"])).toBe("de");
  });

  it("else speaks English", () => {
    expect(pickLocale(null, ["fi", "ja"])).toBe("en");
    expect(pickLocale(null, [])).toBe("en");
  });
});
