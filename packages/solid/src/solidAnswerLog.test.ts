import { describe, expect, it, vi } from "vitest";
import type { Answer } from "@solid-memo/domain/answer";
import { createSolidAnswerLog } from "./solidAnswerLog";
import type { WriteCheck } from "./writeCheck";

const INSTANCE = "https://pod.example/solid-memo/main/";
const HISTORY = `${INSTANCE}history/`;
const SEPTEMBER = `${HISTORY}2026-09.ttl`;
const DECK = `${INSTANCE}catalog.ttl#deck-1`;
const OTHER = `${INSTANCE}catalog.ttl#deck-2`;

/**
 * A pod as far as the answer log needs one: documents as N-Triples lines,
 * which SPARQL Update INSERT DATA and DELETE DATA patches change, an
 * ETag per version checked against If-Match, and containers listing what
 * is under them. Every request is recorded.
 */
function pod() {
  const documents = new Map<string, Set<string>>();
  const versions = new Map<string, number>();
  const requests: { method: string; url: string; ifMatch: string | null; body: string }[] = [];
  let failNext: number | null = null;
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    const body = String(init?.body ?? "");
    requests.push({ method, url, ifMatch: headers.get("If-Match"), body });
    if (failNext !== null) {
      const status = failNext;
      failNext = null;
      return new Response("", { status });
    }
    if (method === "GET" || method === "HEAD") {
      const contained = [...documents.keys()].filter((doc) => doc.startsWith(url) && url.endsWith("/"));
      const lines = url.endsWith("/")
        ? contained.map((doc) => `<${url}> <http://www.w3.org/ns/ldp#contains> <${doc}> .`)
        : [...(documents.get(url) ?? [])];
      if (!url.endsWith("/") && !documents.has(url)) return new Response("", { status: 404 });
      if (url.endsWith("/") && contained.length === 0) return new Response("", { status: 404 });
      const response = new Response(lines.join("\n"), {
        headers: { "Content-Type": "text/turtle", ETag: `"v${versions.get(url) ?? 0}"` },
      });
      Object.defineProperty(response, "url", { value: url });
      return response;
    }
    const ifMatch = headers.get("If-Match");
    if (ifMatch !== null && ifMatch !== `"v${versions.get(url) ?? 0}"`) return new Response("", { status: 412 });
    const triples = documents.get(url) ?? new Set<string>();
    for (const [, operation, block] of body.matchAll(/(INSERT|DELETE) DATA \{\n([\s\S]*?)\n\};/g)) {
      for (const line of block!.split("\n")) {
        if (operation === "INSERT") triples.add(line);
        else triples.delete(line);
      }
    }
    documents.set(url, triples);
    versions.set(url, (versions.get(url) ?? 0) + 1);
    return new Response("", { status: 205 });
  }) as typeof globalThis.fetch;
  return {
    fetch,
    documents,
    requests,
    writes: () => requests.filter((request) => request.method !== "GET" && request.method !== "HEAD"),
    /** The next request fails with this status. */
    failNext(status: number) {
      failNext = status;
    },
    /** Someone else writes the document: it gets a new version. */
    changeElsewhere(url: string) {
      versions.set(url, (versions.get(url) ?? 0) + 1);
    },
  };
}

let n = 0;
function answer(studyDay: string, deckUrl = DECK, prior?: number): Answer {
  n += 1;
  return {
    id: `answer-${n}`,
    deckUrl,
    cardUrl: `${INSTANCE}decks/deck-1.ttl#card-${n}`,
    direction: n % 2 === 0 ? "back-to-front" : "front-to-back",
    grade: 4,
    answeredAt: `${studyDay}T10:00:00.000Z`,
    studyDay,
    ...(prior === undefined ? {} : { priorIntervalDays: prior }),
    nextIntervalDays: 6,
  };
}

describe("createSolidAnswerLog", () => {
  it("adds each answer to its month's document with an insert-only PATCH, unread and unconditional, and reads them back", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const first = answer("2026-09-21");
    const second = answer("2026-09-30", DECK, 6);
    await log.append(INSTANCE, first);
    await log.append(INSTANCE, second);
    expect(fake.requests.map((request) => [request.method, request.url, request.ifMatch])).toEqual([
      ["PATCH", SEPTEMBER, null],
      ["PATCH", SEPTEMBER, null],
    ]);
    expect(fake.requests[0]!.body).toMatch(/^INSERT DATA \{\n<https:\/\/pod\.example\/solid-memo\/main\/history\/2026-09\.ttl#answer-\d+> /);
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual(expect.arrayContaining([first, second]));
  });

  it("checks an answer before adding it, and adds nothing the check refuses", async () => {
    const fake = pod();
    const checkWrite = vi.fn<WriteCheck>(async () => {
      throw new Error("does not conform");
    });
    const log = createSolidAnswerLog({ fetch: fake.fetch, checkWrite });
    const given = answer("2026-09-21");
    await expect(log.append(INSTANCE, given)).rejects.toThrow("does not conform");
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [`${SEPTEMBER}#${given.id}`]);
    expect(fake.requests).toEqual([]);
  });

  it("says when the pod refuses an answer", async () => {
    const fake = pod();
    fake.failNext(500);
    await expect(createSolidAnswerLog({ fetch: fake.fetch }).append(INSTANCE, answer("2026-09-21"))).rejects.toMatchObject({
      code: "addFailed",
      detail: `url: ${SEPTEMBER}\nstatus: 500`,
    });
  });

  it("lists the months it has a document for, oldest first, and none without a log", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await expect(log.months(INSTANCE)).resolves.toEqual([]);
    await log.append(INSTANCE, answer("2026-10-01"));
    await log.append(INSTANCE, answer("2026-09-21"));
    fake.documents.set(`${HISTORY}notes.ttl`, new Set());
    await expect(log.months(INSTANCE)).resolves.toEqual(["2026-09", "2026-10"]);
  });

  it("reads a month leniently: none for a month without a document, and a subject that does not fit left out", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([]);
    const given = answer("2026-09-21");
    await log.append(INSTANCE, given);
    fake.documents.get(SEPTEMBER)!.add(`<${SEPTEMBER}#odd> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://solid-memo.com/ns/vocab/v1.ttl#Answer> .`);
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([given]);
  });

  it("removes a deck's answers of a study day, and only those, saving only when there are some", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await log.removeDay(INSTANCE, DECK, "2026-09-21");
    const kept = [answer("2026-09-20"), answer("2026-09-21", OTHER)];
    for (const given of [answer("2026-09-21"), ...kept, answer("2026-09-21", DECK, 6)]) await log.append(INSTANCE, given);
    await log.removeDay(INSTANCE, DECK, "2026-09-22");
    const before = fake.writes().length;
    await log.removeDay(INSTANCE, DECK, "2026-09-21");
    expect(fake.writes().length).toBe(before + 1);
    expect(fake.writes().at(-1)!.ifMatch).toBe('"v4"');
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual(expect.arrayContaining(kept));
    expect(await log.readMonth(INSTANCE, "2026-09")).toHaveLength(2);
  });

  it("removes a day again when another write came first, and gives up after three tries", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await log.append(INSTANCE, answer("2026-09-21"));
    const writeOnce = fake.fetch;
    let elsewhere = 1;
    const racing = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH" && elsewhere-- > 0) fake.changeElsewhere(SEPTEMBER);
      return writeOnce(input, init);
    }) as typeof globalThis.fetch;
    await createSolidAnswerLog({ fetch: racing }).removeDay(INSTANCE, DECK, "2026-09-21");
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([]);

    await log.append(INSTANCE, answer("2026-09-21"));
    elsewhere = 3;
    await expect(createSolidAnswerLog({ fetch: racing }).removeDay(INSTANCE, DECK, "2026-09-21")).rejects.toThrow(
      "was changed elsewhere",
    );
  });

  it("passes on a failure that is not a lost race", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await log.append(INSTANCE, answer("2026-09-21"));
    const failing = (async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH" ? new Response("", { status: 500 }) : fake.fetch(input, init)) as typeof globalThis.fetch;
    await expect(createSolidAnswerLog({ fetch: failing }).removeDay(INSTANCE, DECK, "2026-09-21")).rejects.toThrow();
  });
});
