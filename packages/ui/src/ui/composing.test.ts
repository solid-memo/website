import { describe, expect, it } from "vitest";
import { composing } from "./composing";

describe("composing", () => {
  it("tells a key an input method takes from one the app does", () => {
    expect(composing(new KeyboardEvent("keydown", { key: "Enter" }))).toBe(false);
    expect(composing(new KeyboardEvent("keydown", { key: "Enter", isComposing: true }))).toBe(true);
    expect(composing(new KeyboardEvent("keydown", { key: "Enter", keyCode: 229 }))).toBe(true);
  });
});
