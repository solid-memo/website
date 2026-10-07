import { describe, expect, it } from "vitest";
import { STUDY_DIRECTIONS, TOPICS } from "@solid-memo/vocab/concepts.generated";
import {
  answerModeOfConcept,
  conceptOfAnswerMode,
  conceptByIri,
  conceptByNotation,
  conceptOfDirection,
  conceptOfPolicy,
  conceptOfTheme,
  directionOfConcept,
  policyOfConcept,
  themeOfConcept,
} from "./concepts";
import { INVALID_DATA_POLICIES } from "./invalidDataPolicy";
import { THEME_CHOICES } from "./theme";
import { DECK_DIRECTIONS } from "./deck";

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";

describe("conceptByIri and conceptByNotation", () => {
  it("find a concept of a scheme, or nothing", () => {
    expect(conceptByIri(TOPICS, "https://solid-memo.com/ns/vocab/topics.ttl#swedish")?.label).toEqual({ en: "Swedish", sv: "Svenska" });
    expect(conceptByIri(TOPICS, `${SM}frontToBack`)).toBeUndefined();
    expect(conceptByNotation(STUDY_DIRECTIONS, "bidirectional")?.iri).toBe(`${SM}bidirectional`);
    expect(conceptByNotation(STUDY_DIRECTIONS, "sideways")).toBeUndefined();
  });
});

describe("study directions as concepts", () => {
  it("map every deck direction to its concept and back", () => {
    for (const direction of DECK_DIRECTIONS) {
      expect(directionOfConcept(conceptOfDirection(direction))).toBe(direction);
    }
    expect(conceptOfDirection("back-to-front")).toBe(`${SM}backToFront`);
  });

  it("name no direction for a concept outside the scheme", () => {
    expect(directionOfConcept("https://solid-memo.com/ns/vocab/topics.ttl#swedish")).toBeUndefined();
  });

  it("name no direction for a concept whose notation the app does not know", () => {
    const scheme = STUDY_DIRECTIONS as unknown as { concepts: { iri: string; notation?: string }[] };
    const original = scheme.concepts[0].notation;
    scheme.concepts[0].notation = "sideways";
    try {
      expect(directionOfConcept(`${SM}frontToBack`)).toBeUndefined();
    } finally {
      scheme.concepts[0].notation = original;
    }
  });
});

describe("invalid data policies as concepts", () => {
  it("map every policy to its concept and back", () => {
    for (const policy of INVALID_DATA_POLICIES) {
      expect(policyOfConcept(conceptOfPolicy(policy))).toBe(policy);
    }
    expect(conceptOfPolicy("warn-only")).toBe(`${SM}warnOnly`);
    expect(policyOfConcept(`${SM}frontToBack`)).toBeUndefined();
  });
});

describe("theme choices as concepts", () => {
  it("map every choice to its concept and back", () => {
    for (const choice of THEME_CHOICES) {
      expect(themeOfConcept(conceptOfTheme(choice))).toBe(choice);
    }
    expect(conceptOfTheme("system")).toBe(`${SM}systemTheme`);
    expect(themeOfConcept(`${SM}warnOnly`)).toBeUndefined();
  });
});

describe("answer modes as concepts", () => {
  it("map each mode to its concept and back; another IRI names none", () => {
    expect(conceptOfAnswerMode("recall")).toBe(`${SM}recall`);
    expect(conceptOfAnswerMode("multiple-choice")).toBe(`${SM}multipleChoice`);
    expect(answerModeOfConcept(`${SM}multipleChoice`)).toBe("multiple-choice");
    expect(answerModeOfConcept(`${SM}recall`)).toBe("recall");
    expect(answerModeOfConcept(`${SM}frontToBack`)).toBeUndefined();
  });
});
