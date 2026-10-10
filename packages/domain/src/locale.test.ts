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
  ])("names %s as %s", (tag, locale) => {
    expect(localeOf(tag)).toBe(locale);
  });

  it("is null for a language the app does not speak", () => {
    expect(localeOf("de-DE")).toBeNull();
  });
});

describe("pickLocale", () => {
  it("speaks the user's choice above all", () => {
    expect(pickLocale("en", ["sv-SE"])).toBe("en");
  });

  it("else speaks the first preferred language it can", () => {
    expect(pickLocale(null, ["de", "sv-SE", "en"])).toBe("sv");
    expect(pickLocale(null, ["de", "ko-KR", "en"])).toBe("ko");
  });

  it("else speaks English", () => {
    expect(pickLocale(null, ["de", "fr"])).toBe("en");
    expect(pickLocale(null, [])).toBe("en");
  });
});
