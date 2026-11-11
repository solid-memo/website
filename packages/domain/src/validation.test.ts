// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import type { Deck } from "./deck";
import { catalogUrlOf } from "./instanceLayout";
import {
  arrangementSetAside,
  deckSetAside,
  limitResults,
  summarize,
  unreadableDocument,
  type DocumentReport,
  type Violation,
} from "./validation";

const INSTANCE = "https://pod.example/solid-memo/a/";

describe("summarize", () => {
  it("counts violations across documents, DCAT-AP ones included, ignoring warnings, newer and untyped subjects", () => {
    const documents: DocumentReport[] = [
      { url: `${INSTANCE}meta.ttl`, status: "missing", subjects: [] },
      {
        url: `${INSTANCE}catalog.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${INSTANCE}catalog.ttl#deck-1`,
            status: "checked",
            shape: "deck",
            version: 2,
            violations: [
              { message: { en: "no title" }, severity: "violation", constraint: "MinCount" },
              { message: { en: "odd" }, severity: "warning", constraint: "Pattern" },
            ],
          },
          {
            url: `${INSTANCE}catalog.ttl#deck-2`,
            status: "newer",
            shape: "deck",
            version: 3,
            latest: 2,
          },
          { url: `${INSTANCE}catalog.ttl#note`, status: "untyped" },
          {
            url: "https://creativecommons.org/publicdomain/zero/1.0/",
            status: "profiled",
            violations: [
              {
                message: { en: "class" },
                severity: "violation",
                constraint: "Class",
                profile: "dcat-ap",
              },
            ],
          },
        ],
      },
      {
        url: `${INSTANCE}decks/deck-1.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${INSTANCE}decks/deck-1.ttl#se`,
            status: "checked",
            shape: "card",
            version: 2,
            violations: [
              { message: { en: "literal" }, severity: "violation", constraint: "NodeKind" },
            ],
          },
        ],
      },
    ];
    expect(summarize(INSTANCE, documents)).toEqual({
      instanceUrl: INSTANCE,
      documents,
      violationCount: 3,
      conforms: false,
    });
  });

  it("conforms when nothing is violated", () => {
    expect(summarize(INSTANCE, [])).toEqual({
      instanceUrl: INSTANCE,
      documents: [],
      violationCount: 0,
      conforms: true,
    });
  });
});

describe("what fails, and the decks set aside for it", () => {
  const report = summarize(INSTANCE, [
    {
      url: `${INSTANCE}catalog.ttl`,
      status: "checked",
      subjects: [
        {
          url: `${INSTANCE}catalog.ttl#deck-1`,
          status: "checked",
          shape: "deck",
          version: 3,
          violations: [{ message: { en: "x" }, severity: "violation", constraint: "MinCount" }],
        },
        {
          url: `${INSTANCE}catalog.ttl#deck-2`,
          status: "checked",
          shape: "deck",
          version: 3,
          violations: [{ message: { en: "x" }, severity: "warning", constraint: "MinCount" }],
        },
        { url: `${INSTANCE}catalog.ttl#note`, status: "untyped" },
      ],
    },
    {
      url: `${INSTANCE}reviews/deck-3.ttl`,
      status: "checked",
      subjects: [
        {
          url: `${INSTANCE}reviews/deck-3.ttl#a`,
          status: "profiled",
          violations: [
            {
              message: { en: "x" },
              severity: "violation",
              constraint: "Class",
              profile: "dcat-ap",
            },
          ],
        },
      ],
    },
    { url: `${INSTANCE}decks/deck-4.ttl`, status: "missing", subjects: [] },
  ]);
  const deck = (id: string): Deck => ({
    id,
    url: `${INSTANCE}catalog.ttl#${id}`,
    title: { en: id },
    cardsDocumentUrl: `${INSTANCE}decks/${id}.ttl`,
    reviewsDocumentUrl: `${INSTANCE}reviews/${id}.ttl`,
    createdAt: "",
    formatVersion: 3,
    direction: "front-to-back",
    authors: [],
  });

  it("sets aside a deck whose entry, cards or review states fail", () => {
    const cardsFail = summarize(INSTANCE, [
      {
        url: `${INSTANCE}decks/deck-4.ttl`,
        status: "checked",
        subjects: [
          {
            url: `${INSTANCE}decks/deck-4.ttl#x`,
            status: "checked",
            shape: "card",
            version: 2,
            violations: [{ message: { en: "x" }, severity: "violation", constraint: "Or" }],
          },
        ],
      },
    ]);
    const setAside = (from: typeof report, ids: string[]) =>
      ids.filter((id) => deckSetAside(from, deck(id)));
    // deck-1's entry fails, deck-2's only warns, deck-3's review states fail.
    expect(setAside(report, ["deck-1", "deck-2", "deck-3", "deck-4"])).toEqual([
      "deck-1",
      "deck-3",
    ]);
    expect(setAside(cardsFail, ["deck-4"])).toEqual(["deck-4"]);
  });

  // A document the check could not read holds back what it is part of, and only that.
  it("counts a document it could not read as a violation, and sets aside only the decks naming it", () => {
    const unread = summarize(INSTANCE, [
      { url: `${INSTANCE}catalog.ttl`, status: "checked", subjects: [] },
      unreadableDocument(`${INSTANCE}decks/deck-5.ttl`, "403"),
    ]);
    expect(unread).toMatchObject({ violationCount: 1, conforms: false });
    expect(unread.documents[1]).toEqual({
      url: `${INSTANCE}decks/deck-5.ttl`,
      status: "unreadable",
      subjects: [],
      reason: "403",
    });
    expect(deckSetAside(unread, deck("deck-5"))).toBe(true);
    expect(deckSetAside(unread, deck("deck-6"))).toBe(false);
    expect(arrangementSetAside(unread)).toBe(false);
  });

  it("walks the report once, however many decks are asked about, and again for a new report", () => {
    let walks = 0;
    const counted = (from: typeof report): typeof report => ({
      ...from,
      get documents() {
        walks += 1;
        return from.documents;
      },
    });
    const first = counted(report);
    const decks = Array.from({ length: 200 }, (_, i) => deck(`deck-${i}`));
    for (let render = 0; render < 14; render++) {
      for (const each of decks) deckSetAside(first, each);
    }
    expect(walks).toBe(1);
    expect(deckSetAside(counted(report), deck("deck-1"))).toBe(true);
    expect(walks).toBe(2);
  });
});

describe("arrangementSetAside", () => {
  const catalog = (...subjects: DocumentReport["subjects"]) =>
    summarize(INSTANCE, [{ url: `${INSTANCE}catalog.ttl`, status: "checked", subjects }]);
  const broken = [{ message: { en: "x" }, severity: "violation" as const, constraint: "MinCount" }];
  const warned = [{ message: { en: "x" }, severity: "warning" as const, constraint: "MinCount" }];

  it("is set aside when the catalog or a deck group fails", () => {
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#catalog`,
          status: "checked",
          shape: "catalog",
          version: 1,
          violations: broken,
        }),
      ),
    ).toBe(true);
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#group-1`,
          status: "checked",
          shape: "deckGroup",
          version: 1,
          violations: broken,
        }),
      ),
    ).toBe(true);
  });

  it("is set aside when the catalog's document, as catalogUrlOf names it, could not be read", () => {
    // validation.ts writes the catalog's URL out instead of importing catalogUrlOf.
    for (const instance of [INSTANCE, INSTANCE.slice(0, -1)]) {
      expect(
        arrangementSetAside(summarize(instance, [unreadableDocument(catalogUrlOf(instance), "x")])),
      ).toBe(true);
    }
  });

  it("is not for a failing deck, a warning, or what another app wrote", () => {
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#deck-1`,
          status: "checked",
          shape: "deck",
          version: 6,
          violations: broken,
        }),
      ),
    ).toBe(false);
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#catalog`,
          status: "checked",
          shape: "catalog",
          version: 1,
          violations: warned,
        }),
      ),
    ).toBe(false);
    expect(
      arrangementSetAside(
        catalog({
          url: `${INSTANCE}catalog.ttl#theirs`,
          status: "checked",
          shape: "catalog",
          version: 1,
          violations: warned,
          foreign: true,
        }),
      ),
    ).toBe(false);
    expect(
      arrangementSetAside(
        catalog({ url: `${INSTANCE}catalog.ttl#theirs`, status: "profiled", violations: broken }),
      ),
    ).toBe(false);
  });
});

describe("limitResults", () => {
  const result = (i: number): Violation => ({
    message: { en: `wrong ${i}` },
    severity: "violation",
    constraint: "Datatype",
  });

  it("keeps all of 1,000 results", () => {
    const results = Array.from({ length: 1000 }, (_, i) => result(i));
    expect(limitResults(results)).toEqual(results);
  });

  it("keeps the first 1,000 of more, and one that says there are more, which a subject fails by", () => {
    const results = Array.from({ length: 1500 }, (_, i) => result(i));
    const limited = limitResults(results);
    expect(limited.slice(0, 1000)).toEqual(results.slice(0, 1000));
    expect(limited.slice(1000)).toEqual([
      {
        message: {
          en: "There are more results than Solid Memo shows: it lists the 1000 most severe of a check.",
        },
        builtIn: true,
        severity: "violation",
        constraint: "ResultLimit",
      },
    ]);
    // Limited again, as a subject's results with more of its own are: still one that says so.
    expect(limitResults([...limited, result(0)])).toEqual(limited);
    const warned = limitResults(limited.map((one) => ({ ...one, severity: "warning" as const })));
    expect(
      limitResults(warned, "violation").filter((one) => one.constraint === "ResultLimit"),
    ).toEqual([expect.objectContaining({ severity: "violation" })]);
  });

  it("gives the one that says there are more the most severe severity of those left out", () => {
    const warning = (i: number): Violation => ({ ...result(i), severity: "warning" });
    const warnings = Array.from({ length: 1001 }, (_, i) => warning(i));
    expect(limitResults(warnings).at(-1)).toMatchObject({
      constraint: "ResultLimit",
      severity: "warning",
    });
    // A violation is kept ahead of the warnings, and a warning left out for it.
    const withViolation = limitResults([...warnings, result(0)]);
    expect(withViolation).toContainEqual(result(0));
    expect(withViolation.at(-1)?.severity).toBe("warning");
    expect(limitResults([...warnings, result(0), result(1)]).at(-1)?.severity).toBe("warning");
    const violations = Array.from({ length: 1001 }, (_, i) => result(i));
    expect(limitResults([...warnings, ...violations]).at(-1)?.severity).toBe("violation");
    // Results the check left out before making them count too.
    expect(limitResults(warnings, "info").at(-1)?.severity).toBe("warning");
    expect(limitResults(warnings.slice(0, 1000), "violation")).toEqual([
      ...warnings.slice(0, 1000),
      expect.objectContaining({ constraint: "ResultLimit", severity: "violation" }),
    ]);
    expect(limitResults([{ ...result(0), severity: "info" }], "info").at(-1)?.severity).toBe(
      "info",
    );
  });
});
