import { describe, expect, it } from "vitest";
import { escapeRegExp, text, textPattern } from "./strings.ts";

describe("text", () => {
  it("is the app's message at a dotted key, in the language asked", () => {
    expect(text("en", "app.logOut")).toBe("Log out");
    expect(text("sv", "app.logOut")).toBe("Logga ut");
  });

  it("fills placeholders", () => {
    expect(text("en", "app.loggedInAs", { name: "Ada" })).toBe("Logged in as Ada");
  });

  it("picks a plural form by count", () => {
    expect(text("en", "guestOffer.body", { name: "S", count: 1 })).toContain("1 deck.");
    expect(text("en", "guestOffer.body", { name: "S", count: 2 })).toContain("2 decks.");
  });

  it("leaves a placeholder it has no value for", () => {
    expect(text("en", "app.loggedInAs")).toBe("Logged in as {name}");
  });

  it("throws for a key with no message, and for a group of messages", () => {
    expect(() => text("en", "app.noSuchMessage")).toThrow(/en\.json has no message app\.noSuchMessage/);
    expect(() => text("en", "app")).toThrow(/has no message app\.$/);
  });
});

describe("textPattern", () => {
  it("matches the whole message, an unfilled placeholder matching anything", () => {
    const pattern = textPattern("en", "app.loggedInAs");
    expect(pattern.test("Logged in as https://x.example/card#me")).toBe(true);
    expect(pattern.test("Not logged in as x")).toBe(false);
  });

  it("matches filled values literally", () => {
    expect(textPattern("en", "app.loggedInAs", { name: "a.b" }).test("Logged in as aXb")).toBe(false);
  });

  it("captures each unfilled placeholder by its name", () => {
    expect(textPattern("en", "study.position").exec("Card 2 of 3")?.groups).toEqual({ position: "2", total: "3" });
    expect(textPattern("en", "study.position", { total: 3 }).exec("Card 2 of 3")?.groups).toEqual({ position: "2" });
  });
});

describe("escapeRegExp", () => {
  it("makes a pattern that matches the text literally", () => {
    const text = "a.b*(c)? [d] {e} ^f$ g|h \\i +j";
    expect(new RegExp(`^${escapeRegExp(text)}$`).test(text)).toBe(true);
    expect(new RegExp(escapeRegExp("a.b")).test("aXb")).toBe(false);
  });
});
