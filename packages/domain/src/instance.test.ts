import { describe, expect, it } from "vitest";
import { AppError } from "./appError";
import { DATA_CLASSES, instanceName, isPrivateOnly } from "./instance";

describe("instanceName", () => {
  it("trims the name, and refuses an empty one", () => {
    expect(instanceName("  Languages ")).toBe("Languages");
    expect(() => instanceName(" ")).toThrow(new AppError("instanceNameEmpty"));
  });
});

describe("data classes", () => {
  it("keep review states and answers to the private type index alone", () => {
    expect(DATA_CLASSES.filter(isPrivateOnly)).toEqual(["reviewState", "answer"]);
    expect(DATA_CLASSES.filter((dataClass) => !isPrivateOnly(dataClass))).toEqual(["instance", "catalog", "deck", "card"]);
  });
});
