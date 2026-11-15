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
import { cpuTime, growth } from "./testing/growth";

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

  it("takes out an address on an IPv6 host or with parentheses in its path", () => {
    expect(
      withoutAddresses("Failed at https://[fd00::1]:8443/alice/profile/card#me now", SITE),
    ).toBe("Failed at <address> now");
    expect(withoutAddresses("see https://pod.example/(private)/notes.ttl", SITE)).toBe(
      "see <address>",
    );
    expect(withoutAddresses("(see https://pod.example/alice/card).", SITE)).toBe(
      "(see <address>).",
    );
  });

  it("takes out an address with escaped slashes, encoded twice or more, or with one slash", () => {
    expect(withoutAddresses('{"error":"https:\\/\\/pod.example\\/alice\\/card"}', SITE)).toBe(
      '{"error":"<address>"}',
    );
    expect(withoutAddresses("x https%253A%252F%252Fpod.example%252Falice%252F y", SITE)).toBe(
      "x <address> y",
    );
    expect(withoutAddresses("x https%25253a%25252f%25252fpod.example y", SITE)).toBe(
      "x <address> y",
    );
    expect(withoutAddresses("https:/pod.example/alice", SITE)).toBe("<address>");
    expect(withoutAddresses("Failed at https://pod.example/alice now", SITE)).toBe(
      "Failed at <address> now",
    );
  });

  it("takes out the whole address when a bracket or a parenthesis comes later in it", () => {
    expect(withoutAddresses("https://alice@[fd00::1]:8443/alice/card", SITE)).toBe("<address>");
    expect(withoutAddresses("https://pod.example/?next=https://[fd00::1]/alice", SITE)).toBe(
      "<address>",
    );
    expect(withoutAddresses("https://pod.example/a[1]/secret", SITE)).toBe("<address>");
    expect(withoutAddresses("https://pod.example/a(b(c)d)/secret", SITE)).toBe("<address>");
    expect(withoutAddresses("https://pod.example/a{b}/secret x", SITE)).toBe("<address> x");
    expect(withoutAddresses("https://pod.example/alice's/card", SITE)).toBe("<address>");
  });

  it("takes out an address escaped or encoded in other ways, or written with backslashes or no slash", () => {
    expect(withoutAddresses('{"e":"https:\\\\\\/\\\\\\/pod.example\\\\\\/alice"}', SITE)).toBe(
      '{"e":"<address>"}',
    );
    expect(withoutAddresses("https:\\u002F\\u002Fpod.example\\u002Falice", SITE)).toBe("<address>");
    expect(withoutAddresses("https%3A%2Fpod.example%2Falice", SITE)).toBe("<address>");
    expect(withoutAddresses("https%3A//pod.example/alice", SITE)).toBe("<address>");
    expect(withoutAddresses("https:%2F%2Fpod.example/alice", SITE)).toBe("<address>");
    expect(withoutAddresses("https:\\\\pod.example\\\\alice", SITE)).toBe("<address>");
    expect(withoutAddresses("https:pod.example/alice", SITE)).toBe("<address>");
    expect(withoutAddresses("HTTPS://POD.EXAMPLE/ALICE", SITE)).toBe("<address>");
  });

  it("keeps the brackets and stops around an address that are the sentence's", () => {
    expect(withoutAddresses("x (https://pod.example/a(b)) y", SITE)).toBe("x (<address>) y");
    expect(withoutAddresses("[https://pod.example/x], {https://pod.example/y}.", SITE)).toBe(
      "[<address>], {<address>}.",
    );
    expect(withoutAddresses("<https://pod.example/x>", SITE)).toBe("<<address>>");
  });

  it("takes out an address after the site's own in the same word", () => {
    expect(withoutAddresses(`${SITE}assets/x.js?u=https://alice@[fd00::1]/card:1:2`, SITE)).toBe(
      "assets/x.js<address>",
    );
  });

  it("leaves a scheme with no address after it as it is", () => {
    expect(withoutAddresses("httpd stopped; https is off", SITE)).toBe(
      "httpd stopped; https is off",
    );
  });

  it("passes over a long run of schemes, escapes and encodings in time linear in its length", () => {
    const ratio = growth(
      (length) => {
        const text = `${"https:/(".repeat(length / 16)}${"a(https%25\\".repeat(length / 24)}`;
        return () => withoutAddresses(text, SITE);
      },
      20_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("passes over a long run of parentheses and encodings that close no address in time linear in its length", () => {
    const ratio = growth(
      (length) => {
        const text = `https://x/(${"a".repeat(length / 2)} https%${"25".repeat(length / 4)}`;
        return () => withoutAddresses(text, SITE);
      },
      20_000,
      8,
    );
    expect(ratio).toBeLessThan(4);
  });

  it("passes over a word of schemes and encodings that are no address about as fast as a word without them", () => {
    // Undoing much of the rest of the word again at each scheme took
    // hundreds of times as long as a word without one.
    const best = (text: string) =>
      Math.min(...Array.from({ length: 5 }, () => cpuTime(() => withoutAddresses(text, SITE))));
    const length = 72_000;
    best("a".repeat(length));
    const plain = best("a".repeat(length));
    for (const unit of ["http%2525", "https%25"]) {
      const word = unit.repeat(length / unit.length);
      expect(best(word) / plain).toBeLessThan(40);
    }
  });

  it("takes out an address that starts a long way into a word of schemes that are none", () => {
    expect(
      withoutAddresses(`${"http%25".repeat(40)}https:\\u002F\\u002Fpod.example/alice x`, SITE),
    ).toBe(`${"http%25".repeat(40)}<address> x`);
    expect(withoutAddresses(`${"https%25".repeat(5)}https:pod.example/alice`, SITE)).toBe(
      `${"https%25".repeat(5)}<address>`,
    );
  });

  it("takes out the whole of an address too long to be read whole for its host", () => {
    expect(
      withoutAddresses(`https:\\u002F\\u002Fuser:${"p".repeat(600)}@pod.example/alice`, SITE),
    ).toBe("<address>");
    expect(withoutAddresses(`https://user:${"p".repeat(600)}@pod.example/alice x`, SITE)).toBe(
      "<address> x",
    );
    expect(withoutAddresses(`https:user:${"p".repeat(600)}@pod.example/alice`, SITE)).toBe(
      "<address>",
    );
    expect(withoutAddresses(`https%3Auser%3A${"p".repeat(600)}%40pod.example%2Falice`, SITE)).toBe(
      "<address>",
    );
    expect(withoutAddresses(`https:user:${"p".repeat(600)}@[2001:db8::1]/alice`, SITE)).toBe(
      "<address>",
    );
    expect(
      withoutAddresses(
        `https:user:${"p".repeat(100)}https:${"q".repeat(500)}@pod.example/alice`,
        SITE,
      ),
    ).toBe("<address>");
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
    expect(routeOf(`#/study?https:user:${"p".repeat(600)}@pod.example/alice=1`, SITE)).toBe(
      "#/study?<address>=",
    );
  });

  it("cuts a long path and long names short, and keeps the first names", () => {
    expect(routeOf(`#/${"a".repeat(800)}`, SITE)).toBe(`#/${"a".repeat(499)}…`);
    expect(routeOf(`#/study?${"k".repeat(1000)}=1&deck=x`, SITE)).toBe(
      `#/study?${"k".repeat(499)}…=&deck=`,
    );
    const keys = Array.from({ length: 30 }, (_, n) => `k${n}`);
    expect(routeOf(`#/study?${keys.map((key) => `${key}=1`).join("&")}`, SITE)).toBe(
      `#/study?${keys
        .slice(0, 20)
        .map((key) => `${key}=`)
        .join("&")}`,
    );
  });

  it("leaves out the word a long path is cut in, and never splits a character", () => {
    expect(routeOf(`#/${"a".repeat(2000)}`, SITE)).toBe("#/…");
    expect(routeOf(`#/${"a".repeat(498)}😀${"b".repeat(100)}`, SITE)).toBe(`#/${"a".repeat(498)}…`);
    expect(routeOf(`${"a".repeat(2000)}?k=1`, SITE)).toBe("…?k=");
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
    const error = new Error("x ".repeat(1000));
    error.stack = Array.from({ length: 40 }, (_, i) => `f${i}@${SITE}a.js:${i}:1`).join("\n");
    const lines = errorDetails(error, PLACE).split("\n");
    expect(lines[2]).toHaveLength("Error: ".length + 500);
    expect(lines[2]?.endsWith("…")).toBe(true);
    expect(lines.slice(3)).toHaveLength(12);
    expect(lines[3]).toBe("f0@a.js:0:1");
  });

  it("shortens a long frame", () => {
    const error = new Error("broken");
    error.stack = `${"f".repeat(800)}@${SITE}a.js:1:1`;
    const frame = errorDetails(error, PLACE).split("\n")[3];
    expect(frame).toBe(`${"f".repeat(499)}…`);
  });

  it("reads a word that ends exactly where the reading stops", () => {
    // "Error: " and the address take 990 characters, "abc" the last 3 read.
    const message = `https://pod.example/${"a".repeat(969)} abc rest`;
    const line = errorDetails(new Error(message), PLACE).split("\n")[2];
    expect(line).toBe("Error: Error: <address> abc…");
  });

  it("takes out an address the cut falls in, or that the cut would split", () => {
    const at = (message: string) => errorDetails(new Error(message), PLACE).split("\n")[2];
    // An address across MAX_TEXT is read whole before the details are cut.
    const across = at(`${"word ".repeat(95)}alice@pod.example.org${" more".repeat(20)}`);
    expect(across).not.toContain("alice");
    expect(across).toContain("<address>");
    // An address across the end of what is read is left out with its word,
    // even when the addresses before it leave room for it in the details.
    const read = at(`${POD}${"p".repeat(600)} ${"word ".repeat(68)}alice@pod.example.org rest`);
    expect(read).not.toContain("alice");
    expect(read).toBe(`Error: Error: <address> ${"word ".repeat(67)}word…`);
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
