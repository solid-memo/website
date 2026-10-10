import { describe, expect, it } from "vitest";
import { ariaNames } from "./ariaNames.ts";

describe("ariaNames", () => {
  it("reads the names of a role, quoted plainly or as YAML that needs quoting, states and children aside", () => {
    const snapshot = [
      `- 'radiogroup "Question: it''s \\"this\\"?"':`,
      `  - radio "One" [checked] [disabled]`,
      `  - 'radio "Two: too"'`,
      `  - radio "ThreeRight answer"`,
      `  - text: "1"`,
      `- radio`,
    ].join("\n");
    expect(ariaNames(snapshot, "radiogroup")).toEqual([`Question: it's "this"?`]);
    expect(ariaNames(snapshot, "radio")).toEqual(["One", "Two: too", "ThreeRight answer"]);
    expect(ariaNames(snapshot, "button")).toEqual([]);
  });
});
