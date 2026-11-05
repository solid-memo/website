// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { MAX_LOG_MONTHS, type Answer } from "@solid-memo/domain/answer";
import { monthSummaryToRecord } from "@solid-memo/domain/digestRecord";
import { monthSummaryOf } from "@solid-memo/domain/studyDigest";
import { statisticsOf } from "@solid-memo/domain/statistics";
import { APPEND_DEADLINE_MS, createSolidAnswerLog } from "./solidAnswerLog";
import type { WriteCheck } from "./writeCheck";
import { MAX_PATCH_BYTES } from "./client/sparqlUpdate";

const INSTANCE = "https://pod.example/solid-memo/main/";
const HISTORY = `${INSTANCE}history/`;
const SEPTEMBER = `${HISTORY}2026-09.ttl`;
const DECK = `${INSTANCE}catalog.ttl#deck-1`;
const OTHER = `${INSTANCE}catalog.ttl#deck-2`;

/** Answers a GET or HEAD: a document's lines, or what a container lists. */
function serveRead(
  documents: Map<string, Set<string>>,
  versions: Map<string, number>,
  url: string,
  headers: Headers,
): Response {
  const contained = [...documents.keys()].filter((doc) => doc.startsWith(url) && url.endsWith("/"));
  const lines = url.endsWith("/")
    ? contained.map((doc) => `<${url}> <http://www.w3.org/ns/ldp#contains> <${doc}> .`)
    : [...(documents.get(url) ?? [])];
  if (!url.endsWith("/") && !documents.has(url)) return new Response("", { status: 404 });
  if (url.endsWith("/") && contained.length === 0) return new Response("", { status: 404 });
  const etag = `"v${versions.get(url) ?? 0}"`;
  if (headers.get("If-None-Match") === etag)
    return new Response(null, { status: 304, headers: { ETag: etag } });
  const response = new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/turtle", ETag: etag },
  });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

/** Applies a PATCH's INSERT DATA and DELETE DATA, if its If-Match holds. */
function applyPatch(
  documents: Map<string, Set<string>>,
  versions: Map<string, number>,
  url: string,
  headers: Headers,
  body: string,
): Response {
  const ifMatch = headers.get("If-Match");
  if (ifMatch !== null && ifMatch !== `"v${versions.get(url) ?? 0}"`)
    return new Response("", { status: 412 });
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
}

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
    if (method === "GET" || method === "HEAD") return serveRead(documents, versions, url, headers);
    return applyPatch(documents, versions, url, headers, body);
  }) as typeof globalThis.fetch;
  return {
    fetch,
    documents,
    requests,
    writes: () =>
      requests.filter((request) => request.method !== "GET" && request.method !== "HEAD"),
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
    expect(fake.requests[0]!.body).toMatch(
      /^INSERT DATA \{\n<https:\/\/pod\.example\/solid-memo\/main\/history\/2026-09\.ttl#answer-\d+> /,
    );
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual(
      expect.arrayContaining([first, second]),
    );
  });

  it("adds a course's multiple-choice answer with its mode and the wrong option chosen, and reads them back", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const chosen: Answer = {
      ...answer("2026-09-21"),
      grade: 1,
      mode: "multiple-choice",
      chosenDistractor: `${INSTANCE}decks/deck-1.ttl#q-iri-d1`,
    };
    await log.append(INSTANCE, chosen);
    expect(fake.requests[0]!.body).toContain(
      `<https://solid-memo.com/ns/vocab/v1.ttl#answerMode> <https://solid-memo.com/ns/vocab/v1.ttl#multipleChoice>`,
    );
    expect(fake.requests[0]!.body).toContain(
      `<https://solid-memo.com/ns/vocab/v1.ttl#chosenDistractor> <${chosen.chosenDistractor}>`,
    );
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([chosen]);
  });

  it("adds an answer with its response times, prior due day and offset from UTC, and reads them back", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const timed: Answer = {
      ...answer("2026-09-21"),
      recallMillis: 2_400,
      gradeMillis: 900,
      priorDue: "2026-09-20",
      utcOffsetMinutes: -330,
    };
    await log.append(INSTANCE, timed);
    for (const triple of [
      `<https://solid-memo.com/ns/vocab/v1.ttl#recallMillis> "2400"`,
      `<https://solid-memo.com/ns/vocab/v1.ttl#gradeMillis> "900"`,
      `<https://solid-memo.com/ns/vocab/v1.ttl#priorDue> "2026-09-20"`,
      `<https://solid-memo.com/ns/vocab/v1.ttl#utcOffsetMinutes> "-330"`,
    ]) {
      expect(fake.requests[0]!.body).toContain(triple);
    }
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([timed]);
  });

  it("checks an answer before adding it, and adds nothing the check refuses", async () => {
    const fake = pod();
    const checkWrite = vi.fn<WriteCheck>(async () => {
      throw new Error("does not conform");
    });
    const log = createSolidAnswerLog({ fetch: fake.fetch, checkWrite });
    const given = answer("2026-09-21");
    await expect(log.append(INSTANCE, given)).rejects.toThrow("does not conform");
    expect(checkWrite).toHaveBeenCalledWith(expect.anything(), [`${SEPTEMBER}#${given.id}`], "pod");
    expect(fake.requests).toEqual([]);
  });

  it("says when the pod refuses an answer", async () => {
    const fake = pod();
    fake.failNext(500);
    await expect(
      createSolidAnswerLog({ fetch: fake.fetch }).append(INSTANCE, answer("2026-09-21")),
    ).rejects.toMatchObject({
      code: "addFailed",
      detail: `url: ${SEPTEMBER}\nstatus: 500`,
    });
  });

  it("gives up adding an answer the pod does not answer in time, so it can be added again", async () => {
    vi.useFakeTimers();
    try {
      const silent = vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const added = createSolidAnswerLog({ fetch: silent }).append(INSTANCE, answer("2026-09-21"));
      const failed = expect(added).rejects.toMatchObject({ name: "AbortError" });
      await vi.advanceTimersByTimeAsync(APPEND_DEADLINE_MS);
      await failed;
      expect(silent).toHaveBeenCalledWith(SEPTEMBER, expect.objectContaining({ method: "PATCH" }));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds many answers with one insert-only PATCH per month, checked first, and adding them again changes nothing", async () => {
    const fake = pod();
    const checkWrite = vi.fn<WriteCheck>(async () => undefined);
    const log = createSolidAnswerLog({ fetch: fake.fetch, checkWrite });
    const september = [answer("2026-09-21"), answer("2026-09-30", DECK, 6)];
    const october = answer("2026-10-01");
    await log.appendAll(INSTANCE, [september[0]!, october, september[1]!]);
    expect(fake.requests.map((request) => [request.method, request.url, request.ifMatch])).toEqual([
      ["PATCH", SEPTEMBER, null],
      ["PATCH", `${HISTORY}2026-10.ttl`, null],
    ]);
    expect(checkWrite).toHaveBeenCalledWith(
      expect.anything(),
      september.map((given) => `${SEPTEMBER}#${given.id}`),
      "pod",
    );
    await log.appendAll(INSTANCE, september);
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual(
      expect.arrayContaining(september),
    );
    expect(await log.readMonth(INSTANCE, "2026-09")).toHaveLength(2);
    expect(fake.documents.get(SEPTEMBER)!.size).toBe(fake.requests[0]!.body.split("\n").length - 3);
    await log.appendAll(INSTANCE, []);
    expect(fake.writes()).toHaveLength(3);
  });

  it("splits a month's answers over several PATCHes rather than send one larger than a pod reads, each answer whole", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const many = Array.from({ length: 300 }, () => answer("2026-09-21"));
    await log.appendAll(INSTANCE, many);
    const patches = fake.writes();
    expect(patches.length).toBeGreaterThan(1);
    for (const patch of patches)
      expect(new TextEncoder().encode(patch.body).length).toBeLessThanOrEqual(MAX_PATCH_BYTES + 32);
    expect(await log.readMonth(INSTANCE, "2026-09")).toHaveLength(300);
  });

  it("adds no answer the check refuses, and says when the pod refuses some", async () => {
    const fake = pod();
    const refusing = createSolidAnswerLog({
      fetch: fake.fetch,
      checkWrite: async () => {
        throw new Error("does not conform");
      },
    });
    await expect(refusing.appendAll(INSTANCE, [answer("2026-09-21")])).rejects.toThrow(
      "does not conform",
    );
    expect(fake.requests).toEqual([]);
    fake.failNext(500);
    await expect(
      createSolidAnswerLog({ fetch: fake.fetch }).appendAll(INSTANCE, [answer("2026-09-21")]),
    ).rejects.toMatchObject({
      code: "addFailed",
    });
  });

  it("lists the months it has a document for, oldest first, and none without a log or not of the calendar", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await expect(log.months(INSTANCE, "9999-12")).resolves.toEqual([]);
    await log.append(INSTANCE, answer("2026-10-01"));
    await log.append(INSTANCE, answer("2026-09-21"));
    fake.documents.set(`${HISTORY}notes.ttl`, new Set());
    // A name of the shape that is no month of the calendar is none of the log's.
    fake.documents.set(`${HISTORY}2027-00.ttl`, new Set());
    fake.documents.set(`${HISTORY}2027-13.ttl`, new Set());
    await expect(log.months(INSTANCE, "9999-12")).resolves.toEqual(["2026-09", "2026-10"]);
    // None after the month given.
    await expect(log.months(INSTANCE, "2026-09")).resolves.toEqual(["2026-09"]);
  });

  it("lists only history/'s own documents, in one request, never a folder below it", async () => {
    // Every folder below history/ lists more folders, on and on.
    const requests: string[] = [];
    const fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      const children = Array.from({ length: 50 }, (_, i) => `<${url}${i}/>`);
      if (url === HISTORY) children.push(`<${SEPTEMBER}>`, `<${HISTORY}2026-10.ttl>`);
      const response = new Response(
        `<${url}> <http://www.w3.org/ns/ldp#contains> ${children.join(", ")} .`,
        { headers: { "Content-Type": "text/turtle" } },
      );
      Object.defineProperty(response, "url", { value: url });
      return response;
    }) as typeof globalThis.fetch;
    await expect(createSolidAnswerLog({ fetch }).months(INSTANCE, "2026-12")).resolves.toEqual([
      "2026-09",
      "2026-10",
    ]);
    expect(requests).toEqual([HISTORY]);
  });

  it("lists the newest months of a log of very many: MAX_LOG_MONTHS of them", async () => {
    const fake = pod();
    const months = Array.from({ length: 2000 }, (_, i) => {
      const year = 1900 + Math.floor(i / 12);
      return `${year}-${String((i % 12) + 1).padStart(2, "0")}`;
    });
    for (const month of months) fake.documents.set(`${HISTORY}${month}.ttl`, new Set());
    const listed = await createSolidAnswerLog({ fetch: fake.fetch }).months(INSTANCE, "9999-12");
    expect(listed).toEqual(months.slice(-MAX_LOG_MONTHS));
    expect(fake.requests).toHaveLength(1);
  });

  it("lists every month up to the one given, however many later months the log lists", async () => {
    const fake = pod();
    const real = ["2026-09", "2026-10", "2026-11"];
    const later = Array.from({ length: MAX_LOG_MONTHS + 12 }, (_, i) => {
      const year = 9000 + Math.floor(i / 12);
      return `${year}-${String((i % 12) + 1).padStart(2, "0")}`;
    });
    for (const month of [...real, ...later])
      fake.documents.set(`${HISTORY}${month}.ttl`, new Set());
    await expect(
      createSolidAnswerLog({ fetch: fake.fetch }).months(INSTANCE, "2026-11"),
    ).resolves.toEqual(real);
  });

  it("reads a month leniently: none for a month without a document, and a subject that does not fit left out", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([]);
    const given = answer("2026-09-21");
    await log.append(INSTANCE, given);
    fake.documents
      .get(SEPTEMBER)!
      .add(
        `<${SEPTEMBER}#odd> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://solid-memo.com/ns/vocab/v1.ttl#Answer> .`,
      );
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([given]);
  });

  it("leaves out an answer whose study day is not a real date, which the statistics could not count from", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const given = answer("2026-09-21");
    await log.append(INSTANCE, given);
    // The shape's pattern lets a day of the 31st of September through.
    await log.append(INSTANCE, { ...answer("2026-09-31"), answeredAt: given.answeredAt });
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([given]);
  });

  it("leaves out a prior due day that is not a real date or is out of range, and keeps the answer", async () => {
    const given = answer("2026-09-21");
    // The reader does not apply the shape's pattern to the prior due day.
    for (const priorDue of ['=HYPERLINK("https://other.example/")', "2026-09-31", "0100-01-03"]) {
      const log = createSolidAnswerLog({ fetch: pod().fetch });
      await log.append(INSTANCE, { ...given, priorDue });
      await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([given]);
    }
  });

  it("leaves out response times of very many digits, so the month's summary stays one the write check accepts", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const given = answer("2026-09-21");
    await log.append(INSTANCE, { ...given, recallMillis: 1, gradeMillis: 1 });
    const digits = "9".repeat(400);
    const lines = fake.documents.get(SEPTEMBER)!;
    for (const line of [...lines]) {
      const time = /^(.*#(?:recall|grade)Millis> )"1"(.*)$/.exec(line);
      if (time === null) continue;
      lines.delete(line);
      lines.add(`${time[1]}"${line.includes("#grade") ? "-" : ""}${digits}"${time[2]}`);
    }
    expect([...lines].filter((line) => line.includes(digits))).toHaveLength(2);
    const answers = await log.readMonth(INSTANCE, "2026-09");
    expect(answers).toEqual([given]);
    const summary = monthSummaryOf(answers);
    expect(summary.recallSeconds).toEqual({});
    const record = monthSummaryToRecord({ document: SEPTEMBER, version: '"v1"', summary });
    for (const count of record.recallSeconds ?? [])
      expect(count).toMatch(/^([0-9]|[1-5][0-9]|60) [1-9][0-9]*$/);
  });

  it("leaves out a response time of very many digits written as a bare integer", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const given = answer("2026-09-21");
    await log.append(INSTANCE, { ...given, recallMillis: 1, gradeMillis: 1 });
    const digits = "9".repeat(400);
    const lines = fake.documents.get(SEPTEMBER)!;
    for (const line of [...lines]) {
      const time = /^(.*#recallMillis> )"1"\^\^<[^>]+>(.*)$/.exec(line);
      if (time === null) continue;
      lines.delete(line);
      lines.add(`${time[1]}${digits}${time[2]}`);
    }
    expect([...lines].filter((line) => line.includes(`> ${digits} .`))).toHaveLength(1);
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([
      { ...given, gradeMillis: 1 },
    ]);
  });

  it("keeps an interval beyond the cap, which an older answer may carry, and counts it; leaves out one of very many digits", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const old = { ...answer("2026-09-21", DECK, 40_000), nextIntervalDays: 40_000 };
    const broken = answer("2026-09-22", DECK, 6);
    await log.append(INSTANCE, old);
    await log.append(INSTANCE, broken);
    const digits = "9".repeat(400);
    const lines = fake.documents.get(SEPTEMBER)!;
    for (const line of [...lines]) {
      if (!line.startsWith(`<${SEPTEMBER}#${broken.id}>`)) continue;
      const interval = /^(.*#nextIntervalDays> )"6"(.*)$/.exec(line);
      if (interval === null) continue;
      lines.delete(line);
      lines.add(`${interval[1]}"${digits}"${interval[2]}`);
    }
    expect([...lines].filter((line) => line.includes(digits))).toHaveLength(1);
    const answers = await log.readMonth(INSTANCE, "2026-09");
    expect(answers).toEqual([old]);
    const statistics = statisticsOf(answers, "2026-09-21");
    expect(statistics.totals.answers).toBe(1);
    expect(statistics.intervals.at(-1)!.recall).toEqual({ reviews: 1, recalled: 1 });
  });

  it("keeps a prior due day at either end of the range study days are held to", async () => {
    for (const priorDue of ["0100-01-04", "9999-12-31"]) {
      const given = { ...answer("2026-09-21"), priorDue };
      const log = createSolidAnswerLog({ fetch: pod().fetch });
      await log.append(INSTANCE, given);
      await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual([given]);
    }
  });

  it("leaves out an answer of a day outside its document's month, but not one a day either side", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const given = answer("2026-09-21");
    await log.append(INSTANCE, given);
    /** An answer of `studyDay`, written into September's document. */
    const inSeptember = async (studyDay: string) => {
      const misplaced = answer(studyDay);
      await log.append(INSTANCE, misplaced);
      const url = `${HISTORY}${studyDay.slice(0, 7)}.ttl`;
      for (const line of fake.documents.get(url)!)
        fake.documents.get(SEPTEMBER)!.add(line.replaceAll(url, SEPTEMBER));
      return misplaced;
    };
    const before = await inSeptember("2026-08-31");
    const after = await inSeptember("2026-10-01");
    await inSeptember("2026-10-02");
    await inSeptember("9999-12-31");
    await inSeptember("9000-01-01");
    const read = await log.readMonth(INSTANCE, "2026-09");
    expect(read).toEqual(expect.arrayContaining([given, before, after]));
    expect(read).toHaveLength(3);
    const since = await log.readMonthSince(INSTANCE, "2026-09", undefined);
    expect(since).toEqual({ unchanged: false, value: read, version: '"v1"' });
  });

  it("leaves out an answer of a day before the earliest that shifting a day keeps in order", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    const january = `${HISTORY}0100-01.ttl`;
    const given = answer("0100-01-04");
    await log.append(INSTANCE, given);
    // A day a day before the month, which the earliest day would otherwise let through.
    for (const studyDay of ["0099-12-31", "0100-01-03"]) {
      await log.append(INSTANCE, answer(studyDay));
      const url = `${HISTORY}${studyDay.slice(0, 7)}.ttl`;
      for (const line of fake.documents.get(url)!)
        fake.documents.get(january)!.add(line.replaceAll(url, january));
    }
    await expect(log.readMonth(INSTANCE, "0100-01")).resolves.toEqual([given]);
  });

  it("reads a month again only when its document changed since the version known", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await expect(log.readMonthSince(INSTANCE, "2026-09", undefined)).resolves.toEqual({
      unchanged: false,
      value: [],
      version: "absent",
    });
    const given = answer("2026-09-21");
    await log.append(INSTANCE, given);
    const read = await log.readMonthSince(INSTANCE, "2026-09", "absent");
    expect(read).toEqual({ unchanged: false, value: [given], version: '"v1"' });
    await expect(log.readMonthSince(INSTANCE, "2026-09", '"v1"')).resolves.toEqual({
      unchanged: true,
    });
    const more = answer("2026-09-22");
    await log.append(INSTANCE, more);
    await expect(log.readMonthSince(INSTANCE, "2026-09", '"v1"')).resolves.toEqual({
      unchanged: false,
      value: expect.arrayContaining([given, more]),
      version: '"v2"',
    });
  });

  it("removes a deck's answers of a study day, and only those, saving only when there are some", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await log.removeDay(INSTANCE, DECK, "2026-09-21");
    const kept = [answer("2026-09-20"), answer("2026-09-21", OTHER)];
    for (const given of [answer("2026-09-21"), ...kept, answer("2026-09-21", DECK, 6)])
      await log.append(INSTANCE, given);
    await log.removeDay(INSTANCE, DECK, "2026-09-22");
    const before = fake.writes().length;
    await log.removeDay(INSTANCE, DECK, "2026-09-21");
    expect(fake.writes().length).toBe(before + 1);
    expect(fake.writes().at(-1)!.ifMatch).toBe('"v4"');
    await expect(log.readMonth(INSTANCE, "2026-09")).resolves.toEqual(expect.arrayContaining(kept));
    expect(await log.readMonth(INSTANCE, "2026-09")).toHaveLength(2);
  });

  it("removes one answer by its id, and only it, saving only when it is there", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await log.removeAnswer(INSTANCE, "2026-09-21", "answer-none");
    const undone = answer("2026-09-21");
    const kept = [answer("2026-09-21"), answer("2026-09-20")];
    for (const given of [undone, ...kept]) await log.append(INSTANCE, given);
    const before = fake.writes().length;
    await log.removeAnswer(INSTANCE, "2026-09-21", "answer-none");
    expect(fake.writes().length).toBe(before);
    await log.removeAnswer(INSTANCE, "2026-09-21", undone.id);
    expect(fake.writes().length).toBe(before + 1);
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
    await expect(
      createSolidAnswerLog({ fetch: racing }).removeDay(INSTANCE, DECK, "2026-09-21"),
    ).rejects.toThrow("was changed elsewhere");
  });

  it("passes on a failure that is not a lost race", async () => {
    const fake = pod();
    const log = createSolidAnswerLog({ fetch: fake.fetch });
    await log.append(INSTANCE, answer("2026-09-21"));
    const failing = (async (input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PATCH"
        ? new Response("", { status: 500 })
        : fake.fetch(input, init)) as typeof globalThis.fetch;
    await expect(
      createSolidAnswerLog({ fetch: failing }).removeDay(INSTANCE, DECK, "2026-09-21"),
    ).rejects.toThrow();
  });
});
