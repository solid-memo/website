// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { DeckHealth } from "@solid-memo/domain/deckHealth";
import { problem } from "@solid-memo/domain/release/problems";
import { createI18n } from "@solid-memo/ui/i18n";
import type { MarkdownProblem } from "@solid-memo/ui/MarkdownEditing";
import { courseDraft, instanceA, invalidReport, makeCard, makeDeck } from "../test/fixtures";
import { PROBLEM_LIMIT } from "./ProblemList";
import { deckProblemsOf, useWorkspaceProblems } from "./WorkspaceProblems";

const en = createI18n("en");
const kanji = makeDeck("deck-1", { en: "Kanji N5" });
const water = makeCard(kanji, "water");
const fire = makeCard(kanji, "fire");

const health = (part: Partial<DeckHealth<MarkdownProblem>>): DeckHealth<MarkdownProblem> => ({
  report: { ...invalidReport([]), violationCount: 0 },
  unstated: [],
  duplicates: [],
  markdown: [],
  ...part,
});

describe("deckProblemsOf", () => {
  it("lists the deck's data in one line at its health, then each spot at its field", () => {
    const found = deckProblemsOf(
      kanji,
      health({
        report: invalidReport([kanji]),
        unstated: [{ card: water, place: { tab: "content", part: "front" } }],
        duplicates: [[fire, water]],
        markdown: [
          {
            card: fire,
            place: { tab: "content", part: "backNote" },
            language: "en",
            finding: { code: "tooLong", length: 9000 },
          },
        ],
      }),
      en,
    );
    expect(found.map((one) => one.text)).toEqual([
      "1 problem in the deck's data",
      "water, front: its language is not stated",
      "fire: says the same as another card",
      "fire, note under the back: Too long to read as Markdown (9,000 characters): it shows as plain text.",
    ]);
    expect(found.map((one) => one.route)).toEqual([
      { screen: "health", instanceUrl: instanceA.url, deckUrl: kanji.url },
      { screen: "card", deckUrl: kanji.url, cardUrl: water.url, tab: "content", field: "front" },
      { screen: "card", deckUrl: kanji.url, cardUrl: fire.url, tab: "content" },
      { screen: "card", deckUrl: kanji.url, cardUrl: fire.url, tab: "content", field: "backNote" },
    ]);
  });

  it("names the cards in the deck's card language first", () => {
    const swedish = { ...kanji, cardLanguage: "sv" };
    const vatten = { ...water, front: { en: "water", sv: "vatten" } };
    const found = deckProblemsOf(swedish, health({ duplicates: [[vatten, fire]] }), en);
    expect(found.map((one) => one.text)).toEqual(["vatten: says the same as another card"]);
  });

  it("lists nothing of a healthy deck, nor of the languages it could not check", () => {
    expect(deckProblemsOf(kanji, health({}), en)).toEqual([]);
    expect(deckProblemsOf(kanji, health({ unstated: null }), en)).toEqual([]);
  });
});

describe("useWorkspaceProblems", () => {
  it("counts all of a draft's problems, and goes (F8) only through those the dock lists", async () => {
    const draft = courseDraft();
    const rules = (["error", "warning"] as const).flatMap((severity) =>
      Array.from({ length: 3000 }, (_, at) =>
        problem(`${draft.url}#${severity}-${at}`, { code: "noBack", params: {} }, { severity }),
      ),
    );
    const useCases = {
      checkReleaseDraft: async () => ({ rules, library: [], drops: [], markdown: [], shapes: [] }),
    } as unknown as UseCases;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () =>
        useWorkspaceProblems(
          useCases,
          { screen: "draft", draftUrl: draft.url },
          { deck: null, draft },
        ),
      {
        wrapper: ({ children }: { children?: ComponentChildren }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
    await waitFor(() => expect(result.current.problems!.count).toBe(6000));
    expect(result.current.problems!.routes).toHaveLength(2 * PROBLEM_LIMIT);
  });
});
