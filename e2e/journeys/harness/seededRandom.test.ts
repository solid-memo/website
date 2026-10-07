import { afterEach, describe, expect, it } from "vitest";
import { seedRandom } from "./seededRandom.ts";

const original = Math.random;
const draw = (seed: number) => {
  seedRandom(seed);
  return Array.from({ length: 5 }, () => Math.random());
};

describe("seedRandom", () => {
  afterEach(() => {
    Math.random = original;
  });

  it("gives the same numbers for the same seed", () => {
    expect(draw(42)).toEqual(draw(42));
  });

  it("gives other numbers for another seed", () => {
    expect(draw(42)).not.toEqual(draw(43));
  });

  it("stays in [0, 1)", () => {
    seedRandom(7);
    for (let i = 0; i < 10_000; i++) {
      const n = Math.random();
      expect(n >= 0 && n < 1).toBe(true);
    }
  });

  it("refers to nothing outside itself, as a script added to a page must", () => {
    expect(() => new Function(`(${seedRandom.toString()})(1); return Math.random();`)()).not.toThrow();
  });
});
