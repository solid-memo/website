// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VOCAB_ROOT } from "@solid-memo/vocab/tooling/root";
import { withLinkedReleasesChecked } from "@solid-memo/application/library";
import type { DocumentReport } from "@solid-memo/domain/validation";
import { RELEASE_LIMITS } from "./client/readLimits";
import { createSolidDeckLibrary } from "./solidDeckLibrary";

/**
 * Reads of releases from a link are bounded together, however many a
 * catalog names (docs/deck-library.md, From a link): a few at once,
 * within one budget a page session, and few of them kept.
 */

const HOST = "https://elsewhere.example/releases/";
const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const V2 = "https://alice.example/solid-memo/main/releases/capitals/v2.ttl";
const STANDALONE = readFileSync(
  join(VOCAB_ROOT, "fixtures/library-deck/v6/valid/library-standalone-release.ttl"),
  "utf8",
);
const INDEX = `${HOST}index.ttl`;

const releaseAt = (url: string, padding = 0) =>
  STANDALONE.replaceAll(`<${V2}>`, `<${url}>`) +
  (padding === 0
    ? ""
    : `\n<#padding> <${SM}padding> ${Array.from({ length: padding }, (_, at) => at).join(",")} .\n`);

const urlOf = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

function turtle(url: string, body: string): Response {
  const response = new Response(body, { status: 200, headers: { "Content-Type": "text/turtle" } });
  Object.defineProperty(response, "url", { value: url });
  return response;
}

/** A fetch answering each address with its document, and what it was asked. */
function serving(documents: (url: string) => string | undefined) {
  const asked: string[] = [];
  const fetch = (async (input: RequestInfo | URL) => {
    const url = urlOf(input);
    asked.push(url);
    const document = documents(url);
    return document === undefined ? new Response("", { status: 404 }) : turtle(url, document);
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

function library(fetch: typeof globalThis.fetch, conforms: (url: string) => boolean = () => true) {
  return createSolidDeckLibrary({
    fetch,
    indexUrl: INDEX,
    validate: async (url): Promise<DocumentReport> => ({
      url,
      status: "checked",
      subjects: conforms(url)
        ? []
        : [
            {
              url,
              status: "checked",
              shape: "libraryDeck",
              version: 1,
              violations: [
                { severity: "violation", message: { en: "No" }, constraint: "minCount" },
              ],
            },
          ],
    }),
  });
}

const accept = () => undefined;

afterEach(() => {
  vi.useRealTimers();
});

describe("the page session's budget", () => {
  it("reads padded releases of a catalog only up to it, and fails the rest without asking their server", async () => {
    const padding = RELEASE_LIMITS.quads / 2;
    const urls = Array.from({ length: 8 }, (_, at) => `${HOST}r${at}/v1.ttl`);
    const { fetch, asked } = serving((url) =>
      urls.includes(url) ? releaseAt(url, padding) : undefined,
    );
    const deckLibrary = library(fetch);
    const results = await Promise.allSettled(
      urls.map((url) => deckLibrary.readRelease(url, accept)),
    );
    const read = results.filter((result) => result.status === "fulfilled");
    expect(read.length).toBeLessThan(5);
    expect(read.length).toBeGreaterThan(0);
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toMatchObject({ code: "linkedReadsSpent" });
      }
    }
    const answered = asked.length;
    await expect(deckLibrary.readRelease(urls.at(-1)!, accept)).rejects.toMatchObject({
      code: "linkedReadsSpent",
      vars: { url: urls.at(-1) },
    });
    expect(asked).toHaveLength(answered);
  }, 180_000);

  it("counts a lookup's and a plan's reads too, a catalog that cannot be read then being no answer", async () => {
    const big = `${HOST}big/v1.ttl`;
    const bigs = [big, `${HOST}big2/v1.ttl`, `${HOST}big3/v1.ttl`];
    const { fetch, asked } = serving((url) =>
      bigs.includes(url) ? releaseAt(url, RELEASE_LIMITS.quads - 100) : undefined,
    );
    const deckLibrary = library(fetch);
    await deckLibrary.linkedReads().readRelease(bigs[0]!);
    await deckLibrary.linkedReads().readRelease(bigs[1]!);
    await expect(deckLibrary.linkedReads().readRelease(bigs[2]!)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
    const answered = asked.length;
    await expect(deckLibrary.publishedBeside(big)).resolves.toBeNull();
    await expect(deckLibrary.linkedReads().publishedBeside(big)).resolves.toBeNull();
    expect(asked).toHaveLength(answered);
  }, 180_000);

  it("leaves the cards of the library's own releases and a release past its own limits as they were", async () => {
    const big = `${HOST}big/v1.ttl`;
    const big2 = `${HOST}big2/v1.ttl`;
    const tooLarge = `${HOST}huge/v1.ttl`;
    const listed = "https://solid-memo.com/decks/capitals/v2.ttl";
    const { fetch } = serving((url) => {
      if (url === big || url === big2) return releaseAt(url, RELEASE_LIMITS.quads - 100);
      if (url === tooLarge) return releaseAt(url, RELEASE_LIMITS.quads + 1);
      return url === listed ? releaseAt(url) : undefined;
    });
    const deckLibrary = library(fetch);
    await expect(deckLibrary.readRelease(tooLarge)).rejects.toMatchObject({
      code: "releaseTooLarge",
    });
    await deckLibrary.readRelease(big);
    await expect(deckLibrary.readRelease(big2)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
    await expect(deckLibrary.fetchLibraryDeck(listed)).resolves.toMatchObject({ url: listed });
    // A read from its link knows no index: it is refused as any other is.
    await expect(deckLibrary.readRelease(listed, accept)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
  }, 180_000);

  it("takes a document that says it does not fit in what is left as the budget spent", async () => {
    const big = `${HOST}big/v1.ttl`;
    const big2 = `${HOST}big2/v1.ttl`;
    const small = `${HOST}small/v1.ttl`;
    const padding = `\n#${"#".repeat(RELEASE_LIMITS.bytes - 10_000)}`;
    const { fetch, asked } = serving((url) =>
      url === big || url === big2 ? releaseAt(url) + padding : releaseAt(url),
    );
    const declaring = (async (input: RequestInfo | URL) => {
      const response = await fetch(input);
      if (urlOf(input) === small) response.headers.set("Content-Length", "100000");
      return response;
    }) as typeof globalThis.fetch;
    const deckLibrary = library(declaring);
    await deckLibrary.readRelease(big);
    await deckLibrary.readRelease(big2);
    await expect(deckLibrary.readRelease(small)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
    const answered = asked.length;
    await expect(deckLibrary.readRelease(`${HOST}other/v1.ttl`)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
    expect(asked).toHaveLength(answered);
  });

  it("sees no difference for a few ordinary decks", async () => {
    const urls = Array.from({ length: 12 }, (_, at) => `${HOST}r${at}/v1.ttl`);
    const { fetch, asked } = serving((url) => (urls.includes(url) ? releaseAt(url) : undefined));
    const deckLibrary = library(fetch);
    await Promise.all(urls.map((url) => deckLibrary.readRelease(url, accept)));
    await Promise.all(urls.map((url) => deckLibrary.fetchLibraryDeck(url)));
    expect(asked).toEqual(urls);
  });

  it("counts a document read again once, so looking up the same copies again never spends it", async () => {
    // Each release is a quarter of what one may hold: reading all four once fits, and three times would not.
    const urls = Array.from({ length: 4 }, (_, at) => `${HOST}r${at}/v1.ttl`);
    const other = `${HOST}other/v1.ttl`;
    const { fetch, asked } = serving((url) =>
      urls.includes(url) || url === other ? releaseAt(url, RELEASE_LIMITS.quads / 4) : undefined,
    );
    const deckLibrary = library(fetch);
    for (let round = 0; round < 3; round++) {
      for (const url of urls) {
        const lookup = deckLibrary.linkedReads();
        await lookup.readRelease(url);
        await lookup.publishedBeside(url);
      }
    }
    expect(asked.filter((url) => url === urls[0])).toHaveLength(3);
    // Room is left for another release, as if each had been read once.
    await expect(deckLibrary.readRelease(other)).resolves.toMatchObject({ url: other });
  }, 180_000);

  it("looks up and plans a few ordinary copies again and again and never spends it", async () => {
    const urls = Array.from({ length: 5 }, (_, at) => `${HOST}r${at}/v1.ttl`);
    const other = `${HOST}other/v1.ttl`;
    const { fetch, asked } = serving((url) =>
      urls.includes(url) || url === other ? releaseAt(url, 100) : undefined,
    );
    const deckLibrary = library(fetch);
    for (let round = 0; round < 100; round++) {
      for (const url of urls) await deckLibrary.linkedReads().readRelease(url, accept);
    }
    expect(asked).toHaveLength(500);
    await expect(deckLibrary.readRelease(other)).resolves.toMatchObject({ url: other });
  }, 180_000);

  it("counts reads of one document again whole past an allowance, however many decks name it", async () => {
    const url = `${HOST}padded/v1.ttl`;
    const other = `${HOST}other/v1.ttl`;
    const padded = `${releaseAt(url)}\n#${"#".repeat(RELEASE_LIMITS.bytes - 10_000)}`;
    const { fetch, asked } = serving((at) => (at === url ? padded : releaseAt(at)));
    const deckLibrary = library(fetch);
    // Each deck's plan or lookup reads it on its own, and keeps what it makes of it.
    let plans = 0;
    await expect(
      (async () => {
        for (;;) {
          await deckLibrary.linkedReads().readRelease(url, accept);
          plans++;
        }
      })(),
    ).rejects.toMatchObject({ code: "linkedReadsSpent" });
    // Its first read, then the allowance's worth, then what the budget has room for.
    expect(plans).toBeGreaterThan(4);
    expect(plans).toBeLessThan(8);
    const answered = asked.length;
    await expect(deckLibrary.readRelease(other)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
    expect(asked).toHaveLength(answered);
  }, 180_000);

  it("lets a document that says its size be read again within its largest read, near the budget", async () => {
    const big = `${HOST}big/v1.ttl`;
    const big2 = `${HOST}big2/v1.ttl`;
    const padding = `\n#${"#".repeat(RELEASE_LIMITS.bytes - 10_000)}`;
    const { fetch } = serving((url) => releaseAt(url) + padding);
    const declaring = (async (input: RequestInfo | URL) => {
      const response = await fetch(input);
      const size = new TextEncoder().encode(releaseAt(urlOf(input)) + padding).byteLength;
      response.headers.set("Content-Length", String(size));
      return response;
    }) as typeof globalThis.fetch;
    const deckLibrary = library(declaring);
    await deckLibrary.readRelease(big);
    await deckLibrary.readRelease(big2);
    await expect(deckLibrary.readRelease(big)).resolves.toMatchObject({ url: big });
    await expect(deckLibrary.readRelease(`${HOST}third/v1.ttl`)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
  }, 60_000);

  it("counts what a document grew by, on top of its largest read before", async () => {
    const url = `${HOST}growing/v1.ttl`;
    const others = [`${HOST}other/v1.ttl`, `${HOST}third/v1.ttl`];
    let padding = RELEASE_LIMITS.quads / 2;
    const { fetch } = serving((asked) => {
      if (asked === url) return releaseAt(asked, padding);
      return others.includes(asked) ? releaseAt(asked, 300_000) : undefined;
    });
    const deckLibrary = library(fetch);
    await deckLibrary.readRelease(url);
    padding = RELEASE_LIMITS.quads - 100;
    await deckLibrary.readRelease(url);
    // A smaller read counts for nothing more, and takes nothing back.
    padding = 0;
    await deckLibrary.readRelease(url);
    await deckLibrary.readRelease(others[0]!);
    await expect(deckLibrary.readRelease(others[1]!)).rejects.toMatchObject({
      code: "linkedReadsSpent",
    });
  }, 180_000);

  it("counts reads of one document at once whole, and gives back what they took once done", async () => {
    const url = `${HOST}big/v1.ttl`;
    const other = `${HOST}other/v1.ttl`;
    const comment = new TextEncoder().encode(`#${"#".repeat(RELEASE_LIMITS.bytes - 100_000)}\n`);
    let open = () => {};
    const gate = new Promise<void>((resolve) => (open = resolve));
    const fetch = (async (input: RequestInfo | URL) => {
      const asked = urlOf(input);
      if (asked === other) return turtle(asked, releaseAt(asked));
      let told = false;
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          if (!told) {
            told = true;
            controller.enqueue(comment);
            return;
          }
          await gate;
          controller.enqueue(new TextEncoder().encode(releaseAt(asked)));
          controller.close();
        },
      });
      const response = new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/turtle" },
      });
      Object.defineProperty(response, "url", { value: asked });
      return response;
    }) as typeof globalThis.fetch;
    const deckLibrary = library(fetch);
    const reads = Array.from({ length: 3 }, () => deckLibrary.readRelease(url));
    // The third is refused while the others are still being read.
    await expect(reads[2]).rejects.toMatchObject({ code: "linkedReadsSpent" });
    open();
    await Promise.allSettled(reads);
    await expect(deckLibrary.readRelease(other)).resolves.toMatchObject({ url: other });
  }, 60_000);
});

describe("reads at once", () => {
  it("runs a few at a time, however many are asked for", async () => {
    let running = 0;
    let most = 0;
    const fetch = (async (input: RequestInfo | URL) => {
      most = Math.max(most, ++running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running--;
      const url = urlOf(input);
      return turtle(url, releaseAt(url));
    }) as typeof globalThis.fetch;
    const deckLibrary = library(fetch);
    await Promise.all(
      Array.from({ length: 20 }, (_, at) => deckLibrary.readRelease(`${HOST}r${at}/v1.ttl`)),
    );
    expect(most).toBe(4);
  });

  it("does not let a server that never answers hold up the others for good", async () => {
    vi.useFakeTimers();
    const hanging = Array.from({ length: 4 }, (_, at) => `${HOST}slow${at}/v1.ttl`);
    const asked: string[] = [];
    const answers: ((response: Response) => void)[] = [];
    const fetch = (async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      asked.push(url);
      if (hanging.includes(url)) {
        return new Promise<Response>((answer) => answers.push(answer));
      }
      return turtle(url, releaseAt(url));
    }) as typeof globalThis.fetch;
    const deckLibrary = library(fetch);
    const late = deckLibrary.readRelease(hanging[0]!);
    for (const url of hanging.slice(1)) void deckLibrary.readRelease(url);
    const next = `${HOST}next/v1.ttl`;
    const read = deckLibrary.readRelease(next);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(asked).not.toContain(next);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(asked).toContain(next);
    vi.useRealTimers();
    await expect(read).resolves.toMatchObject({ url: next });
    // One that answers after its turn is still read, and gives up no turn twice.
    answers[0]!(turtle(hanging[0]!, releaseAt(hanging[0]!)));
    await expect(late).resolves.toMatchObject({ url: hanging[0] });
  });
});

describe("waiting for a turn", () => {
  const never = (asked: string[], answers: (url: string) => boolean) =>
    (async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      asked.push(url);
      return answers(url) ? turtle(url, releaseAt(url)) : new Promise<Response>(() => undefined);
    }) as typeof globalThis.fetch;
  const honest = "https://honest.example/releases/deck/v1.ttl";

  it("lets another host's read go next, however many reads of a host that never answers wait", async () => {
    vi.useFakeTimers();
    const asked: string[] = [];
    const deckLibrary = library(never(asked, (url) => url === honest));
    for (let at = 0; at < 1000; at++) {
      void deckLibrary.readRelease(`${HOST}r${at}/v1.ttl`).catch(() => undefined);
    }
    const read = deckLibrary.readRelease(honest);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(asked).toContain(honest);
    vi.useRealTimers();
    await expect(read).resolves.toMatchObject({ url: honest });
  });

  it("fails what still waits after a while, so that many hosts that never answer hold up none for long", async () => {
    vi.useFakeTimers();
    const asked: string[] = [];
    const deckLibrary = library(never(asked, (url) => url === honest));
    const hosts = Array.from(
      { length: 1000 },
      (_, at) => `https://h${at}.elsewhere.example/releases/deck/v1.ttl`,
    );
    const hanging = hosts.map((url) => deckLibrary.readRelease(url));
    for (const read of hanging) void read.catch(() => undefined);
    await vi.advanceTimersByTimeAsync(1_000);
    const read = deckLibrary.readRelease(honest);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(asked).toContain(honest);
    await expect(hanging.at(-1)).rejects.toMatchObject({
      code: "releaseUnreadable",
      vars: { url: hosts.at(-1) },
    });
    // Those that had their turn are still waiting for their server, not given up.
    expect(asked).toContain(hosts[0]);
    vi.useRealTimers();
    await expect(read).resolves.toMatchObject({ url: honest });
  });

  it("fails each read still waiting, of one host or of an address with none", async () => {
    vi.useFakeTimers();
    const deckLibrary = library(never([], () => false));
    // More than can have a turn before those after them have waited too long.
    for (let at = 0; at < 20; at++) {
      void deckLibrary.readRelease(`https://h${at}.example/v1.ttl`).catch(() => undefined);
    }
    const waiting = [`${HOST}a/v1.ttl`, `${HOST}b/v1.ttl`, "not an address"].map((url) =>
      deckLibrary.readRelease(url),
    );
    const settled = Promise.allSettled(waiting);
    await vi.advanceTimersByTimeAsync(120_000);
    vi.useRealTimers();
    for (const result of await settled) {
      expect(result).toMatchObject({ status: "rejected", reason: { code: "releaseUnreadable" } });
    }
  });

  it("keeps reads of two hosts going in turn, a host that had a turn waiting behind the other", async () => {
    let answer = () => {};
    const gate = new Promise<void>((open) => (answer = open));
    const asked: string[] = [];
    const fetch = (async (input: RequestInfo | URL) => {
      const url = urlOf(input);
      asked.push(url);
      await gate;
      return turtle(url, releaseAt(url));
    }) as typeof globalThis.fetch;
    const deckLibrary = library(fetch);
    const a = Array.from({ length: 7 }, (_, at) => `${HOST}a${at}/v1.ttl`);
    const b = Array.from({ length: 2 }, (_, at) => `https://b.example/r${at}/v1.ttl`);
    const reads = [...a, ...b].map((url) => deckLibrary.readRelease(url));
    await vi.waitFor(() => expect(asked).toHaveLength(4));
    answer();
    await Promise.all(reads);
    expect(asked.slice(4, 8)).toEqual([a[4], b[0], a[5], b[1]]);
    expect(asked[8]).toBe(a[6]);
  });
});

describe("what is kept", () => {
  const first = `${HOST}first/v1.ttl`;
  const second = `${HOST}second/v1.ttl`;
  const padded = (url: string) =>
    url === first || url === second ? releaseAt(url, 60_000) : undefined;

  it("lets an older read go once many triples are kept, and reads it again when its cards are asked for", async () => {
    const { fetch, asked } = serving(padded);
    const deckLibrary = library(fetch);
    await deckLibrary.readRelease(first, accept);
    const outline = await deckLibrary.fetchCourseOutline(first);
    await deckLibrary.readRelease(second, accept);
    expect(asked).toEqual([first, second]);
    // The latest stays, and an older one's outline.
    await deckLibrary.fetchLibraryDeck(second);
    await expect(deckLibrary.fetchCourseOutline(first)).resolves.toBe(outline);
    expect(asked).toEqual([first, second]);
    await expect(deckLibrary.fetchLibraryDeck(first)).resolves.toMatchObject({ url: first });
    expect(asked).toEqual([first, second, first]);
    // Read again, it is kept in its turn, and the other let go.
    await deckLibrary.fetchLibraryDeck(first);
    expect(asked).toEqual([first, second, first]);
    await deckLibrary.fetchLibraryDeck(second);
    expect(asked).toEqual([first, second, first, second]);
  }, 60_000);

  it("holds a read again to the check it passed: what it no longer passes is not given", async () => {
    let fits = true;
    const { fetch } = serving(padded);
    const refusing = vi.fn(() => {
      if (!fits) throw new Error("No longer fits");
    });
    const deckLibrary = library(fetch);
    await deckLibrary.readRelease(first, refusing);
    await deckLibrary.readRelease(second, accept);
    fits = false;
    await expect(deckLibrary.fetchLibraryDeck(first)).rejects.toThrow("No longer fits");
    fits = true;
    await expect(deckLibrary.fetchLibraryDeck(first)).resolves.toMatchObject({ url: first });
  }, 60_000);

  it("keeps one read larger than all that is kept, and a read of a release again in its own place", async () => {
    const large = `${HOST}large/v1.ttl`;
    const { fetch, asked } = serving((url) =>
      url === large ? releaseAt(url, 150_000) : undefined,
    );
    const deckLibrary = library(fetch);
    await deckLibrary.readRelease(large, accept);
    await deckLibrary.fetchLibraryDeck(large);
    expect(asked).toEqual([large]);
    await deckLibrary.readRelease(large, accept);
    await deckLibrary.fetchLibraryDeck(large);
    expect(asked).toEqual([large, large]);
  }, 60_000);

  describe("a read shown before it is added", () => {
    const third = `${HOST}third/v1.ttl`;
    const pin = { pin: true };
    const checkedOver = (fetch: typeof globalThis.fetch) =>
      withLinkedReleasesChecked({
        ...library(fetch),
        readLibraryIndex: async () => ({ url: INDEX, publisher: null, releases: [] }),
      });
    /** A release whose title says which answer of its host it is. */
    const answer = (url: string, title: string, padding = 60_000) =>
      releaseAt(url, padding).replaceAll('"Capitals"@en', `"${title}"@en`);

    it("is the one imported, whatever other reads are accepted and whatever its host says later", async () => {
      let title = "Shown";
      const { fetch, asked } = serving((url) => answer(url, url === first ? title : "Other"));
      const checked = checkedOver(fetch);
      await checked.readRelease(first, accept);
      await checked.fetchLibraryDeck(second);
      await checked.fetchLibraryDeck(third);
      title = "Swapped";
      await expect(checked.fetchLibraryDeck(first)).resolves.toMatchObject({
        title: { en: "Shown" },
      });
      expect(asked.filter((url) => url === first)).toHaveLength(1);
    }, 60_000);

    it("does not count among those kept, which go on being kept beside it", async () => {
      const { fetch, asked } = serving((url) => releaseAt(url, url === third ? 30_000 : 60_000));
      const deckLibrary = library(fetch);
      await deckLibrary.readRelease(first, accept);
      // Kept before it is pinned, it comes out of those kept.
      await deckLibrary.readRelease(first, accept, pin);
      await deckLibrary.readRelease(second, accept);
      await deckLibrary.readRelease(third, accept);
      asked.length = 0;
      await deckLibrary.fetchLibraryDeck(first);
      await deckLibrary.fetchLibraryDeck(second);
      await deckLibrary.fetchLibraryDeck(third);
      expect(asked).toEqual([]);
    }, 60_000);

    it("gives way to the next one shown, which lets it go, and to a read of its own again", async () => {
      let title = "Shown";
      const { fetch, asked } = serving((url) => answer(url, title));
      const deckLibrary = library(fetch);
      await deckLibrary.readRelease(first, accept, pin);
      title = "Again";
      await deckLibrary.readRelease(first, accept, pin);
      await expect(deckLibrary.fetchLibraryDeck(first)).resolves.toMatchObject({
        title: { en: "Again" },
      });
      await deckLibrary.readRelease(second, accept, pin);
      asked.length = 0;
      title = "Later";
      await expect(deckLibrary.fetchLibraryDeck(first)).resolves.toMatchObject({
        title: { en: "Later" },
      });
      expect(asked).toEqual([first]);
      await deckLibrary.fetchLibraryDeck(second);
      expect(asked).toEqual([first]);
    }, 60_000);

    /** A fetch that holds the answers to the addresses given, each with what is served when it is let through. */
    function held(documents: (url: string) => string) {
      const waiting: (() => void)[] = [];
      const fetch = (async (input: RequestInfo | URL) => {
        const url = urlOf(input);
        const document = documents(url);
        await new Promise<void>((resolve) => waiting.push(resolve));
        return turtle(url, document);
      }) as typeof globalThis.fetch;
      return { fetch, waiting };
    }

    it("is not replaced by a read of that release under way when it was shown", async () => {
      let title = "Under way";
      const { fetch, waiting } = held((url) => answer(url, title, 0));
      const deckLibrary = library(fetch);
      const underWay = deckLibrary.readRelease(first, accept);
      await vi.waitFor(() => expect(waiting).toHaveLength(1));
      title = "Shown";
      const shown = deckLibrary.readRelease(first, accept, pin);
      await vi.waitFor(() => expect(waiting).toHaveLength(2));
      waiting[1]!();
      await shown;
      waiting[0]!();
      await underWay;
      await expect(deckLibrary.fetchLibraryDeck(first)).resolves.toMatchObject({
        title: { en: "Shown" },
      });
    });

    it("stays when a read asked to be pinned before it is done after it", async () => {
      let title = "Earlier";
      const { fetch, waiting } = held((url) => answer(url, title, 0));
      const deckLibrary = library(fetch);
      const earlier = deckLibrary.readRelease(first, accept, pin);
      const earlierOther = deckLibrary.readRelease(second, accept, pin);
      await vi.waitFor(() => expect(waiting).toHaveLength(2));
      title = "Shown";
      const shown = deckLibrary.readRelease(first, accept, pin);
      await vi.waitFor(() => expect(waiting).toHaveLength(3));
      waiting[2]!();
      await shown;
      waiting[0]!();
      waiting[1]!();
      await Promise.all([earlier, earlierOther]);
      await expect(deckLibrary.fetchLibraryDeck(first)).resolves.toMatchObject({
        title: { en: "Shown" },
      });
      // That other is kept as any read is, and the one pinned has not been let go for it.
      await expect(deckLibrary.fetchLibraryDeck(second)).resolves.toMatchObject({
        title: { en: "Earlier" },
      });
      expect(waiting).toHaveLength(3);
    });
  });

  it("refuses a read through the checked library again as it would the first", async () => {
    let fits = true;
    const { fetch } = serving(padded);
    const checked = withLinkedReleasesChecked({
      ...library(fetch, () => fits),
      readLibraryIndex: async () => ({ url: INDEX, publisher: null, releases: [] }),
    });
    await checked.fetchLibraryDeck(first);
    await checked.fetchLibraryDeck(second);
    fits = false;
    await expect(checked.fetchLibraryDeck(first)).rejects.toMatchObject({
      code: "releaseNotConforming",
    });
  }, 60_000);
});
