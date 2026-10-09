import { describe, expect, it } from "vitest";
import { DATA_CLASSES, isPrivateOnly } from "./instance";

describe("data classes", () => {
  it("keep review states and answers to the private type index alone", () => {
    expect(DATA_CLASSES.filter(isPrivateOnly)).toEqual(["reviewState", "answer"]);
    expect(DATA_CLASSES.filter((dataClass) => !isPrivateOnly(dataClass))).toEqual(["instance", "catalog", "deck", "card"]);
  });
});
