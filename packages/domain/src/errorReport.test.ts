// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  type ErrorPlace,
  errorDetails,
  errorReportUrl,
  routeOf,
  withoutAddresses,
} from "./errorReport";
import { growth } from "./testing/growth";

const REPO = "https://github.com/solid-memo/website";
const SITE = "https://solid-memo.com/";
const WEBID = "https://alice.pod.example/profile/card#me";
const POD = "https://alice.pod.example/solid-memo/main/";
const DECK = `${POD}decks/capitals/index.ttl`;
const SHA = "0123456789abcdef0123456789abcdef01234567";

const PLACE: ErrorPlace = {
  version: "2.3.0",
  commitSha: SHA,
  hash: `#/study?${new URLSearchParams({ instance: POD, deck: DECK })}`,
  site: SITE,
};

/** An error thrown in the app as Chromium writes its stack: the message, then a frame a line. */
function chromiumError(message: string): Error {
  const error = new TypeError(message);
  error.stack = [
    `TypeError: ${message}`,
    `    at DeckRow (${SITE}assets/index-Bx1.js:12:345)`,
    `    at fetchDeck (${SITE}assets/index-Bx1.js?v=2#x:3:4)`,
  ].join("\n");
  return error;
}

describe("withoutAddresses", () => {
  it("takes out a pod's address, a WebID and an address with a token in its query", () => {
    expect(
      withoutAddresses(
        `Could not read ${DECK} for ${WEBID}: https://idp.example/?code=s3cret`,
        SITE,
      ),
    ).toBe("Could not read <address> for <address>: <address>");
  });

  it("takes out an encoded address, a blob URL and a data URL", () => {
    expect(
      withoutAddresses(
        `${encodeURIComponent(POD)} blob:https://solid-memo.com/1f2e data:text/plain,Paris`,
        SITE,
      ),
    ).toBe("<address> <address> <address>");
  });

  it("takes out an email address and a mailto, tel or urn value", () => {
    expect(
      withoutAddresses(
        "[alice@example.org, mailto:bob@x.se tel:+46701234567 urn:uuid:1f2e alice%40pod.example.net/x]",
        SITE,
      ),
    ).toBe("[<address>, <address> <address> <address> <address>/x]");
  });

  it("takes out an email address in any script, a long one, one at localhost and a tel number with spaces", () => {
    expect(
      withoutAddresses(
        `ålice@example.org alice@exämple.se ${"a".repeat(70)}@example.org alice@localhost alice%2540pod.example tel:+46 70 123 45`,
        SITE,
      ),
    ).toBe("<address> <address> <address> <address> <address> <address>");
  });

  it("passes over a long run of encoded at signs with no host in time linear in its length", () => {
    const ratio = growth(
      (length) => {
        const word = "a%40".repeat(length / 4);
        return () => withoutAddresses(word, SITE);
      },
      20_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("takes out an email address in an error's message quoting pod text", () => {
    const error = new Error("[due 2026-13-40 alice@example.org] does not start with a date-time.");
    error.stack = "";
    expect(errorDetails(error, PLACE)).toContain(
      "Error: Error: [due 2026-13-40 <address>] does not start with a date-time.",
    );
  });

  it("passes over a long word with no address in time linear in its length", () => {
    // Eight times the word must take less than four times as long as an
    // eighth of it done eight times over (testing.md): trying an email's
    // user at every letter to the word's end would take about eight times.
    const ratio = growth(
      (length) => {
        const word = `${"a".repeat(length)}@`;
        return () => withoutAddresses(word, SITE);
      },
      20_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("keeps the path of the site's own scripts, without a query or a hash", () => {
    expect(withoutAddresses(`at f (${SITE}assets/index.js?v=1#top:1:2)`, SITE)).toBe(
      "at f (assets/index.js)",
    );
    expect(withoutAddresses(`f@${SITE}assets/index.js:1:2`, SITE)).toBe("f@assets/index.js:1:2");
  });

  it("leaves text without an address as it is", () => {
    expect(withoutAddresses("x is not a function", SITE)).toBe("x is not a function");
    expect(withoutAddresses("Invalid data: no cards", SITE)).toBe("Invalid data: no cards");
  });
});

describe("routeOf", () => {
  it("keeps the route and its query's names, without their values", () => {
    expect(routeOf(PLACE.hash, SITE)).toBe("#/study?instance=&deck=");
  });

  it("is the route itself when it has no query", () => {
    expect(routeOf("#/studio/", SITE)).toBe("#/studio/");
  });

  it("is the start when there is no hash", () => {
    expect(routeOf("", SITE)).toBe("#/");
    expect(routeOf("#", SITE)).toBe("#/");
  });

  it("takes an address out of a hash typed in by hand", () => {
    expect(routeOf(`#/${POD}`, SITE)).toBe("#/<address>");
  });
});

describe("errorDetails", () => {
  it("says the build, the route, the error and its frames, with no address of the learner's in them", () => {
    const details = errorDetails(chromiumError(`Cannot read ${DECK} of ${WEBID}`), PLACE);
    expect(details).toBe(
      [
        `Version: 2.3.0 (${SHA})`,
        "Route: #/study?instance=&deck=",
        "Error: TypeError: Cannot read <address> of <address>",
        "    at DeckRow (assets/index-Bx1.js:12:345)",
        "    at fetchDeck (assets/index-Bx1.js)",
      ].join("\n"),
    );
    expect(details).not.toContain("alice");
    expect(details).not.toContain("pod.example");
  });

  it("lists a stack that does not start with the message (Firefox, Safari) as it is", () => {
    const error = new Error("broken");
    error.stack = `DeckRow@${SITE}assets/index.js:1:2\n`;
    expect(errorDetails(error, PLACE).split("\n").slice(2)).toEqual([
      "Error: Error: broken",
      "DeckRow@assets/index.js:1:2",
    ]);
  });

  it("names an error with no stack by its message alone", () => {
    const error = new RangeError("too far");
    delete error.stack;
    expect(errorDetails(error, PLACE).split("\n").slice(2)).toEqual(["Error: RangeError: too far"]);
  });

  it("writes out what was thrown when it is not an Error", () => {
    expect(errorDetails("lost", { ...PLACE, commitSha: null })).toBe(
      ["Version: 2.3.0", "Route: #/study?instance=&deck=", "Error: lost"].join("\n"),
    );
  });

  it("shortens a long message and keeps the first frames", () => {
    const error = new Error("x".repeat(2000));
    error.stack = Array.from({ length: 40 }, (_, i) => `f${i}@${SITE}a.js:${i}:1`).join("\n");
    const lines = errorDetails(error, PLACE).split("\n");
    expect(lines[2]).toHaveLength("Error: ".length + 500);
    expect(lines[2]?.endsWith("…")).toBe(true);
    expect(lines.slice(3)).toHaveLength(12);
    expect(lines[3]).toBe("f0@a.js:0:1");
  });
});

describe("errorReportUrl", () => {
  it("opens the bug form with only Where and Version filled in, and nothing private", () => {
    const url = errorReportUrl(REPO, PLACE);
    expect(url.startsWith(`${REPO}/issues/new?`)).toBe(true);
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      template: "bug.yml",
      where: "#/study?instance=&deck=",
      version: `2.3.0 (${SHA})`,
    });
    expect(decodeURIComponent(url)).not.toContain("alice");
  });
});
