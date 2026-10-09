import { describe, expect, it } from "vitest";
import { rebaseIri, UPDATE_STEPS } from "./instanceUpdate";

const MAIN = "https://pod.example/solid-memo/main/";

describe("rebaseIri", () => {
  const TO = "https://pod.example/solid-memo/main-0f3a/";

  it("moves IRIs under the instance, fragments and paths kept", () => {
    expect(rebaseIri(`${MAIN}catalog.ttl#deck-1`, MAIN, TO)).toBe(`${TO}catalog.ttl#deck-1`);
    expect(rebaseIri(MAIN, "https://pod.example/solid-memo/main", TO)).toBe(TO);
  });

  it("leaves every other IRI as it is, a sibling with a longer name included", () => {
    expect(rebaseIri("https://pod.example/solid-memo/main-old/x.ttl", MAIN, TO)).toBe(
      "https://pod.example/solid-memo/main-old/x.ttl",
    );
    expect(rebaseIri("https://solid-memo.com/decks/capitals/v1.ttl", MAIN, TO)).toBe(
      "https://solid-memo.com/decks/capitals/v1.ttl",
    );
  });
});

describe("UPDATE_STEPS", () => {
  it("are the steps the user sees, in order", () => {
    expect(UPDATE_STEPS).toEqual(["stage", "backup", "upgrade", "validate"]);
  });
});
