import { describe, expect, it } from "vitest";
import { describeRepair, planRepair, type RepairKind } from "./repair";
import { summarize, type SubjectReport, type Violation } from "./validation";

const INSTANCE = "https://pod.example/solid-memo/a/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const REVIEWS = `${INSTANCE}reviews/deck-1.ttl`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const DC = "http://purl.org/dc/terms/";

const v = (constraint: string, path?: string, severity: Violation["severity"] = "violation"): Violation => ({
  ...(path === undefined ? {} : { path }),
  message: { en: `${constraint} on ${path ?? "the subject"}` },
  severity,
  constraint,
});
const checked = (url: string, shape: "deck" | "reviewState" | "agent" | "card", violations: Violation[], version = 3): SubjectReport => ({
  url,
  status: "checked",
  shape,
  version,
  violations,
});

describe("planRepair", () => {
  it("repairs what has one safe answer, once per kind and subject, in the subject's own format", () => {
    const report = summarize(INSTANCE, [
      {
        url: CATALOG,
        status: "checked",
        subjects: [
          checked(`${CATALOG}#deck-1`, "deck", [
            v("MinCount", `${DC}description`),
            { ...v("MinCount", `${DC}description`), profile: "dcat-ap" },
            v("In", `${SM}studyDirection`),
          ]),
          checked(`${CATALOG}#deck-2`, "deck", [v("MinCount", `${SM}direction`)], 2),
          checked(`${CATALOG}#agent-x`, "agent", [v("MinCount", "http://xmlns.com/foaf/0.1/name")], 1),
          { url: `${CATALOG}#pub`, status: "profiled", violations: [{ ...v("MinCount", "http://xmlns.com/foaf/0.1/name"), profile: "dcat-ap" }] },
        ],
      },
      {
        url: REVIEWS,
        status: "checked",
        subjects: [
          checked(`${REVIEWS}#a`, "reviewState", [v("Xone"), v("Pattern", `${SM}due`)], 2),
          checked(`${REVIEWS}#b`, "reviewState", [v("Pattern", `${SM}due`, "warning")], 2),
        ],
      },
    ]);
    const kinds = (plan: ReturnType<typeof planRepair>) => plan.repairs.map((r) => [r.subjectUrl.split("#")[1], r.kind, r.version]);
    const plan = planRepair(report);
    expect(kinds(plan)).toEqual([
      ["deck-1", "describe-deck", 3],
      ["deck-1", "direct-deck", 3],
      ["deck-2", "direct-deck", 2],
      ["agent-x", "name-agent", 1],
      ["pub", "name-agent", 1],
      ["a", "drop-snapshot", 2],
      ["a", "recompute-due", 2],
    ]);
    expect(plan.repairs[0].documentUrl).toBe(CATALOG);
    expect(plan.unrepairable).toEqual([]);
  });

  it("leaves what it cannot repair to the user, naming each problem once", () => {
    const report = summarize(INSTANCE, [
      {
        url: `${INSTANCE}decks/deck-1.ttl`,
        status: "checked",
        subjects: [
          checked(`${INSTANCE}decks/deck-1.ttl#x`, "card", [v("Or"), v("Or"), v("MinCount", `${DC}description`)], 2),
          { url: `${INSTANCE}decks/deck-1.ttl#note`, status: "untyped" },
          { url: `${INSTANCE}decks/deck-1.ttl#new`, status: "newer", shape: "card", version: 9, latest: 2 },
        ],
      },
      { url: `${INSTANCE}meta.ttl`, status: "missing", subjects: [] },
    ]);
    expect(planRepair(report)).toEqual({
      repairs: [],
      unrepairable: [
        {
          documentUrl: `${INSTANCE}decks/deck-1.ttl`,
          subjectUrl: `${INSTANCE}decks/deck-1.ttl#x`,
          violations: [v("Or"), v("MinCount", `${DC}description`)],
        },
      ],
    });
  });
});

describe("describeRepair", () => {
  it("says what each repair does", () => {
    const kinds: RepairKind[] = ["describe-deck", "direct-deck", "drop-snapshot", "recompute-due", "name-agent", "remove-subject"];
    expect(kinds.map((kind) => describeRepair({ kind, documentUrl: "d", subjectUrl: "s", version: 1 }))).toEqual([
      "Give the deck the default description",
      "Study the deck front to back",
      "Drop the review's half-written undo snapshot",
      "Recompute the review's due day",
      "Name the person or organisation after their address",
      "Remove it",
    ]);
  });
});
