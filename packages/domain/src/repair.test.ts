// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { planRepair } from "./repair";
import { growth } from "./testing/growth";
import { summarize, type SubjectReport, type Violation } from "./validation";

const INSTANCE = "https://pod.example/solid-memo/a/";
const CATALOG = `${INSTANCE}catalog.ttl`;
const REVIEWS = `${INSTANCE}reviews/deck-1.ttl`;
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const DC = "http://purl.org/dc/terms/";

const v = (
  constraint: string,
  path?: string,
  severity: Violation["severity"] = "violation",
): Violation => ({
  ...(path === undefined ? {} : { path }),
  message: { en: `${constraint} on ${path ?? "the subject"}` },
  severity,
  constraint,
});
const DCAT = "http://www.w3.org/ns/dcat#";

const checked = (
  url: string,
  shape:
    | "deck"
    | "reviewState"
    | "fsrsReviewState"
    | "agent"
    | "card"
    | "catalog"
    | "deckGroup"
    | "instance",
  violations: Violation[],
  version = 3,
): SubjectReport => ({
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
          checked(
            `${CATALOG}#agent-x`,
            "agent",
            [v("MinCount", "http://xmlns.com/foaf/0.1/name")],
            1,
          ),
          {
            url: `${CATALOG}#pub`,
            status: "profiled",
            violations: [
              { ...v("MinCount", "http://xmlns.com/foaf/0.1/name"), profile: "dcat-ap" },
            ],
          },
          checked(
            `${CATALOG}#catalog`,
            "catalog",
            [{ ...v("Class", `${DCAT}catalog`), profile: "dcat-ap" }],
            1,
          ),
          checked(
            `${CATALOG}#group-1`,
            "deckGroup",
            [
              { ...v("Class", `${DCAT}dataset`), profile: "dcat-ap" },
              { ...v("Class", `${DCAT}catalog`), profile: "dcat-ap" },
            ],
            1,
          ),
        ],
      },
      {
        url: REVIEWS,
        status: "checked",
        subjects: [
          checked(`${REVIEWS}#a`, "reviewState", [v("Xone"), v("Pattern", `${SM}due`)], 2),
          checked(`${REVIEWS}#b`, "reviewState", [v("Pattern", `${SM}due`, "warning")], 2),
          checked(`${REVIEWS}#a@fsrs6`, "fsrsReviewState", [v("Xone")], 1),
        ],
      },
    ]);
    const kinds = (plan: ReturnType<typeof planRepair>) =>
      plan.repairs.map((r) => [r.subjectUrl.split("#")[1], r.kind, r.version]);
    const plan = planRepair(report);
    expect(kinds(plan)).toEqual([
      ["deck-1", "describe-deck", 3],
      ["deck-1", "direct-deck", 3],
      ["deck-2", "direct-deck", 2],
      ["agent-x", "name-agent", 1],
      ["pub", "name-agent", 1],
      ["catalog", "drop-dangling-members", 1],
      ["group-1", "drop-dangling-members", 1],
      ["a", "drop-snapshot", 2],
      ["a", "recompute-due", 2],
      ["a@fsrs6", "drop-snapshot", 1],
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
          checked(
            `${INSTANCE}decks/deck-1.ttl#x`,
            "card",
            [v("Or"), v("Or"), v("MinCount", `${DC}description`)],
            2,
          ),
          // A deck's dangling link is no deck-list membership to drop.
          checked(`${INSTANCE}decks/deck-1.ttl#d`, "deck", [v("Class", `${DCAT}dataset`)], 6),
          { url: `${INSTANCE}decks/deck-1.ttl#note`, status: "untyped" },
          {
            url: `${INSTANCE}decks/deck-1.ttl#new`,
            status: "newer",
            shape: "card",
            version: 9,
            latest: 2,
          },
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
        {
          documentUrl: `${INSTANCE}decks/deck-1.ttl`,
          subjectUrl: `${INSTANCE}decks/deck-1.ttl#d`,
          violations: [v("Class", `${DCAT}dataset`)],
        },
      ],
    });
  });

  it("drops the unreadable dates of a subject's optional fields in one repair, and leaves one it needs to the user", () => {
    const unreadable = (path: string): Violation => ({
      ...v("DateTimeRange", path),
      message: { en: "This date is too far in the future or the past." },
      builtIn: true,
      value: "300000-01-01T00:00:00Z",
    });
    const report = summarize(INSTANCE, [
      {
        url: CATALOG,
        status: "checked",
        subjects: [
          checked(
            `${CATALOG}#deck-1`,
            "deck",
            [unreadable(`${DC}created`), unreadable(`${DC}modified`), unreadable(`${DC}created`)],
            6,
          ),
          // Format 1 had no date of change: no field of the deck's to drop it from.
          checked(`${CATALOG}#deck-2`, "deck", [unreadable(`${DC}modified`)], 1),
          checked(`${CATALOG}#it`, "instance", [unreadable(`${DC}created`)], 2),
          { url: `${CATALOG}#pub`, status: "profiled", violations: [unreadable(`${DC}created`)] },
        ],
      },
      {
        url: REVIEWS,
        status: "checked",
        subjects: [
          // The undo snapshot's date goes with the snapshot; the last review is the state's own.
          checked(
            `${REVIEWS}#a`,
            "reviewState",
            [unreadable(`${SM}previousLastReviewedAt`), unreadable(`${SM}lastReviewedAt`)],
            2,
          ),
          checked(
            `${REVIEWS}#a@fsrs6`,
            "fsrsReviewState",
            [unreadable(`${SM}previousLastReviewedAt`)],
            1,
          ),
        ],
      },
    ]);
    const plan = planRepair(report);
    expect(plan.repairs.map((r) => [r.subjectUrl.split("#")[1], r.kind, r.predicates])).toEqual([
      ["deck-1", "drop-unreadable-date", [`${DC}created`, `${DC}modified`]],
      ["a", "drop-snapshot", undefined],
      ["a@fsrs6", "drop-snapshot", undefined],
    ]);
    expect(plan.unrepairable.map((u) => [u.subjectUrl.split("#")[1], u.violations])).toEqual([
      ["deck-2", [unreadable(`${DC}modified`)]],
      ["it", [unreadable(`${DC}created`)]],
      ["pub", [unreadable(`${DC}created`)]],
      ["a", [unreadable(`${SM}lastReviewedAt`)]],
    ]);
  });

  it("plans repairs of many subjects in time that grows with them, not their square", () => {
    // Every review state with half a snapshot and a malformed due day, each
    // found twice: eight times as many must take less than four times as
    // long as an eighth of them planned eight times over (testing.md).
    const ratio = growth(
      (count) => {
        const report = summarize(INSTANCE, [
          {
            url: REVIEWS,
            status: "checked",
            subjects: Array.from({ length: count }, (_, i) =>
              checked(`${REVIEWS}#r${i}`, "reviewState", [
                v("Xone"),
                v("Xone"),
                v("Pattern", `${SM}due`),
              ]),
            ),
          },
        ]);
        return () => planRepair(report);
      },
      500,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });
});
