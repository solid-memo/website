import { expect, it } from "vitest";
import { problem } from "@solid-memo/domain/release/problems";
import { releaseMessage } from "./releaseMessages.ts";

const V1 = "https://solid-memo.com/decks/solid/v1.ttl";
const V2 = "https://solid-memo.com/decks/solid/v2.ttl";
const L = "decks/solid/v2.ttl";

/** Most codes are worded as deckLibrary.test.ts expects; this is the one no release there makes. */
it("words an id given to another kind of subject", () => {
  const message = (detail: Parameters<typeof problem>[1]) => releaseMessage(problem(V2, detail) as Parameters<typeof releaseMessage>[0], L, V2);
  expect(message({ code: "idReused", params: { id: "fi", was: "card", now: "chapter", previous: V1 } })).toBe(
    `${L}: <#fi> is a chapter, but a card in v1.ttl: an id names one subject for good, so give the chapter an id of its own.`,
  );
});
