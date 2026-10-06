import { describe, expect, it } from "vitest";
import { rebaseIri, stagingUrlOf, UPDATE_STEP_LABELS } from "./instanceUpdate";

const MAIN = "https://pod.example/solid-memo/main/";

describe("stagingUrlOf", () => {
  it("names a sibling of the instance after it and a UUID", () => {
    expect(stagingUrlOf(MAIN, "0f3a")).toBe("https://pod.example/solid-memo/main-0f3a/");
    expect(stagingUrlOf("https://pod.example/solid-memo/main", "0f3a")).toBe(
      "https://pod.example/solid-memo/main-0f3a/",
    );
  });
});

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

describe("UPDATE_STEP_LABELS", () => {
  it("names every step for the user", () => {
    expect(Object.keys(UPDATE_STEP_LABELS)).toEqual(["stage", "access", "copy", "upgrade", "validate", "verify", "switch"]);
  });
});
