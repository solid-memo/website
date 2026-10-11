import { describe, expect, it } from "vitest";
import {
  ANSWER_SCALES,
  isAnswerScale,
  MINIMAL_ANSWER_QUALITY,
  MINIMAL_ANSWERS,
} from "./answerScale";
import { repeatsInSession } from "./scheduling";
import { applySm2, INITIAL_SM2_STATE } from "./sm2";

describe("answer scales", () => {
  it("recognizes the known scales only", () => {
    for (const scale of ANSWER_SCALES) expect(isAnswerScale(scale)).toBe(true);
    expect(isAnswerScale("emoji")).toBe(false);
    expect(isAnswerScale(null)).toBe(false);
  });

  it("maps the minimal answers onto increasing SM-2 grades", () => {
    const qualities = MINIMAL_ANSWERS.map((a) => MINIMAL_ANSWER_QUALITY[a]);
    expect(qualities).toEqual([1, 3, 4, 5]);
  });

  it("makes Again the only minimal answer that repeats in the session", () => {
    const repeating = MINIMAL_ANSWERS.filter((a) =>
      repeatsInSession(MINIMAL_ANSWER_QUALITY[a]),
    );
    expect(repeating).toEqual(["again"]);
  });

  it("makes Hard a pass, not a lapse", () => {
    const afterHard = applySm2(INITIAL_SM2_STATE, MINIMAL_ANSWER_QUALITY.hard);
    const afterAgain = applySm2(
      INITIAL_SM2_STATE,
      MINIMAL_ANSWER_QUALITY.again,
    );
    expect(afterHard.repetitions).toBe(1);
    expect(afterAgain.repetitions).toBe(0);
  });
});
