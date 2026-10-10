import { expect, it } from "vitest";
import { problem } from "./problems";

it("makes an error in a subject, with its field and related subjects when there are any", () => {
  expect(problem("s", { code: "noBack", params: {} })).toEqual({ severity: "error", subject: "s", code: "noBack", params: {} });
  expect(problem("s", { code: "noBack", params: {} }, { field: "f", related: [] })).toEqual({
    severity: "error",
    subject: "s",
    field: "f",
    code: "noBack",
    params: {},
  });
  expect(problem("s", { code: "stepPartOf", params: { part: "p" } }, { related: ["p"] })).toEqual({
    severity: "error",
    subject: "s",
    related: ["p"],
    code: "stepPartOf",
    params: { part: "p" },
  });
});

it("makes a warning when asked", () => {
  expect(problem("s", { code: "unshaped", params: {} }, { severity: "warning" })).toEqual({ severity: "warning", subject: "s", code: "unshaped", params: {} });
});
