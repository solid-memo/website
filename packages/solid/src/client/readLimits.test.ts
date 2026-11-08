// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { ReadLimitError } from "./interface";
import { growth } from "@solid-memo/domain/testing/growth";
import type { Literal, NamedNode, Quad, Quad_Object, Quad_Subject } from "@rdfjs/types";
import {
  limitedFetch,
  limitsOf,
  MAX_TERM_CHARACTERS,
  noneSpent,
  quadTally,
  refusalOf,
  RELEASE_LIMITS,
  spentOf,
  termKeyLength,
  textChunks,
  writeTurtle,
} from "./readLimits";
import { parseQuads } from "./resources";

const URL_ = "https://other.example/release.ttl";
const LIMITS = { bytes: 10, quads: 5, characters: 100 };
const XSD = "http://www.w3.org/2001/XMLSchema#";

const namedNode = (value: string) => ({ termType: "NamedNode", value }) as NamedNode;
const blankNode = (value: string) => ({ termType: "BlankNode", value }) as Quad_Subject;
const literal = (value: string, language = "", direction = "", datatype = `${XSD}string`) =>
  ({ termType: "Literal", value, language, direction, datatype: namedNode(datatype) }) as Literal;
const quadOf = (subject: Quad_Subject, object: Quad_Object) =>
  ({
    subject,
    predicate: namedNode(`${URL_}#p`),
    object,
    graph: { termType: "DefaultGraph", value: "" },
  }) as Quad;

/** A fetch answering with `body`, sent in chunks of `chunk` bytes, and whether it was canceled. */
function serving(body: string | null, { chunk = 4, headers = {} as Record<string, string> } = {}) {
  const sent = { canceled: false, chunks: 0 };
  const bytes = new TextEncoder().encode(body ?? "");
  const fetch: typeof globalThis.fetch = async () => {
    let at = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (at >= bytes.length) return controller.close();
        controller.enqueue(bytes.slice(at, at + chunk));
        sent.chunks++;
        at += chunk;
      },
      cancel() {
        sent.canceled = true;
      },
    });
    const response = new Response(body === null ? null : stream, {
      status: body === null ? 304 : 200,
      statusText: "As sent",
      headers: { "Content-Type": "text/turtle", ...headers },
    });
    Object.defineProperty(response, "url", { value: URL_ });
    return response;
  };
  return { fetch, sent };
}

describe("RELEASE_LIMITS", () => {
  it("leaves a wide margin over every release in the library: each a quarter of its bytes, triples and characters or less, and each term half the bound on one or less", async () => {
    const releases = readdirSync(DECKS_ROOT, { recursive: true, encoding: "utf8" }).filter((path) =>
      /(^|\/)v[0-9]+\.ttl$/.test(path),
    );
    expect(releases.length).toBeGreaterThan(100);
    const { bytes, quads, characters } = RELEASE_LIMITS;
    const quarter = { bytes: bytes / 4, quads: quads / 4, characters: characters / 4 };
    for (const path of releases) {
      const file = join(DECKS_ROOT, path);
      expect(statSync(file).size, path).toBeLessThan(quarter.bytes);
      const url = `https://solid-memo.example/decks/${path}`;
      const read = await parseQuads(readFileSync(file, "utf8"), "turtle", url, quarter).catch(
        (error: unknown) => expect.unreachable(`${path}: ${String(error)}`),
      );
      let longest = 0;
      for (const { subject, predicate, object } of read) {
        longest = Math.max(
          longest,
          termKeyLength(subject),
          termKeyLength(predicate),
          termKeyLength(object),
        );
      }
      expect(longest, path).toBeLessThanOrEqual(MAX_TERM_CHARACTERS / 2);
    }
  });
});

describe("termKeyLength", () => {
  it("counts a term by the longest name a library keys it by: its id or its N-Triples form", () => {
    const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
    expect(termKeyLength(blankNode("b0"))).toBe(4);
    // An IRI in `<>`, as N-Triples writes it.
    expect(termKeyLength(namedNode(URL_))).toBe(URL_.length + 2);
    expect(termKeyLength(literal("abc"))).toBe(5);
    expect(termKeyLength(literal("abc", "sv"))).toBe(8);
    expect(termKeyLength(literal("abc", "sv", "", `${RDF}langString`))).toBe(8);
    // The id names a direction; N-Triples writes the datatype of a text with one.
    expect(termKeyLength(literal("abc", "sv", "rtl"))).toBe(13);
    expect(termKeyLength(literal("abc", "sv", "rtl", `${RDF}dirLangString`))).toBe(
      5 + `${RDF}dirLangString`.length + 4,
    );
    expect(termKeyLength(literal("12", "", "", `${XSD}integer`))).toBe(8 + `${XSD}integer`.length);
    // N-Triples writes a quote, a backslash, a line feed and a carriage return as two characters each.
    expect(termKeyLength(literal('a"b\\c\nd\re\t'))).toBe(16);
    expect(termKeyLength(literal("\n", "sv", "", `${RDF}langString`))).toBe(7);
  });
});

describe("limitedFetch", () => {
  it("gives a body within the limit as sent, its status, headers and URL kept, with its limits", async () => {
    const { fetch } = serving("0123456789");
    const response = await limitedFetch(fetch, LIMITS)(URL_);
    expect(response).toMatchObject({ status: 200, statusText: "As sent", url: URL_ });
    expect(response.headers.get("Content-Type")).toBe("text/turtle");
    expect(await response.text()).toBe("0123456789");
    expect(limitsOf(response)).toBe(LIMITS);
    expect(refusalOf(response)).toBeUndefined();
  });

  it("fails a body once it is past the limit, and stops reading it", async () => {
    const { fetch, sent } = serving("0123456789".repeat(100));
    const response = await limitedFetch(fetch, LIMITS)(URL_);
    // The browser fails the read as it fails any; why is kept apart.
    await expect(response.text()).rejects.toBeDefined();
    expect(refusalOf(response)).toBeInstanceOf(ReadLimitError);
    expect(refusalOf(response)).toMatchObject({ url: URL_, limits: LIMITS });
    expect(sent.chunks).toBeLessThan(10);
    await vi.waitFor(() => expect(sent.canceled).toBe(true));
  });

  it("fails at once where the Content-Length says the body is past the limit, and reads none of it", async () => {
    const { fetch, sent } = serving("0123456789".repeat(100), {
      headers: { "Content-Length": "1000" },
    });
    await expect(limitedFetch(fetch, LIMITS)(URL_)).rejects.toBeInstanceOf(ReadLimitError);
    expect(sent.canceled).toBe(true);
  });

  it("with what is spent, reads every answer under the limits together, each counting its bytes into it", async () => {
    const spent = noneSpent();
    const fetch = limitedFetch(serving("0123456").fetch, LIMITS, spent);
    const first = await fetch(URL_);
    expect(await first.text()).toBe("0123456");
    expect(spent).toEqual({ bytes: 7, quads: 0, characters: 0 });
    expect(spentOf(first)).toBe(spent);
    // Within the limits alone, past them with the answer before.
    const second = await fetch(URL_);
    await expect(second.text()).rejects.toBeDefined();
    expect(refusalOf(second)).toMatchObject({ url: URL_, limits: LIMITS });
    // Each answer has the limits to itself without it.
    const own = await limitedFetch(serving("0123456").fetch, LIMITS)(URL_);
    expect(spentOf(own)).toEqual(noneSpent());
    expect(await own.text()).toBe("0123456");
    expect(spentOf(own)).toEqual({ bytes: 7, quads: 0, characters: 0 });
  });

  it("with what is spent, fails at once where the Content-Length says the body is past what is left", async () => {
    const spent = { ...noneSpent(), bytes: 4 };
    const { fetch, sent } = serving("0123456", { headers: { "Content-Length": "7" } });
    await expect(limitedFetch(fetch, LIMITS, spent)(URL_)).rejects.toMatchObject({
      limits: LIMITS,
    });
    expect(sent.canceled).toBe(true);
  });

  it("gives an answer with no body as it is", async () => {
    const { fetch } = serving(null);
    const response = await limitedFetch(fetch, LIMITS)(URL_);
    expect(response.status).toBe(304);
    expect(limitsOf(response)).toBeUndefined();
    expect(refusalOf(undefined)).toBeUndefined();
  });

  it("gives an answer of a status with no body as it is, though the browser gives it an empty one", async () => {
    // A browser can answer a conditional read with a 304 whose body is an empty stream; no Response with a body can have its status.
    const answer = new Response("");
    Object.defineProperty(answer, "status", { value: 304 });
    const response = await limitedFetch(async () => answer, LIMITS)(URL_);
    expect(response).toBe(answer);
    expect(limitsOf(response)).toBeUndefined();
  });
});

describe("textChunks", () => {
  it("gives a text in parts that are the text again, each at most one character past a part's length", () => {
    const text = "0123456789".repeat(1000);
    const chunks = [...textChunks(text)];
    expect(chunks.join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect([...textChunks("")]).toEqual([]);
  });

  it("never ends a part inside a surrogate pair", () => {
    const text = `${"x".repeat(4095)}\u{1F600}y`;
    expect([...textChunks(text)]).toEqual([`${"x".repeat(4095)}\u{1F600}`, "y"]);
  });
});

describe("writeTurtle", () => {
  /** Whether writeTurtle refuses `text`, read as `url`, written to a parser that reads nothing. */
  const refuses = (text: string, url = URL_) =>
    !writeTurtle(
      text,
      url,
      () => undefined,
      () => true,
    );
  const forms = [
    "@base <x/> .",
    "BASE <x/>",
    "@BASE<x/>.",
    "base # an IRI next\n <x/>",
    "Base #\r\n# <>\r\t<x/>",
  ];
  const declaring = (count: number) =>
    Array.from({ length: count }, (_, at) => forms[at % forms.length]).join("\n");
  const lines = "<a> <b> <c> .\n".repeat(1000);

  /** What writeTurtle writes of `text` to the stream it hands the parser, and whether it ends it. */
  const writing = (text: string, goOn: (written: string[]) => boolean) => {
    const written: string[] = [];
    let ended = false;
    const wrote = writeTurtle(
      text,
      URL_,
      (stream) => {
        stream.on("data", (part) => written.push(part!));
        stream.on("end", () => {
          ended = true;
        });
      },
      () => goOn(written),
    );
    return { wrote, written, ended };
  };

  it("writes the text in parts, then its end, to the stream it hands the parser", () => {
    const { wrote, written, ended } = writing(lines, () => true);
    expect(wrote).toBe(true);
    expect(written.length).toBeGreaterThan(1);
    expect(written.join("")).toBe(lines);
    expect(ended).toBe(true);
  });

  it("writes an empty text as a blank one, which the parser ends as it ends any", () => {
    expect(writing("", () => true)).toEqual({ wrote: true, written: [" "], ended: true });
  });

  it("writes no more, nor the end, once told not to go on", () => {
    const { wrote, written, ended } = writing(lines, (written) => written.length < 1);
    expect(wrote).toBe(true);
    expect(written).toHaveLength(1);
    expect(ended).toBe(false);
  });

  it("refuses a text at the part where a base past the limits starts, and writes none of it", () => {
    const text = `${lines}@base <${"a".repeat(600)}/> .\n${lines}`;
    const { wrote, written, ended } = writing(text, () => true);
    expect(wrote).toBe(false);
    expect(written.length).toBeGreaterThan(0);
    expect(text.startsWith(written.join(""))).toBe(true);
    expect(written.join("").length).toBeLessThanOrEqual(lines.length);
    expect(ended).toBe(false);
  });

  it("lets a text declare its base 16 times, in any form, and no more", () => {
    expect(refuses(declaring(16))).toBe(false);
    expect(refuses(declaring(17))).toBe(true);
    // Each of these is a declaration to the parser too.
    expect(refuses(`${declaring(16)}\n<a> <b> <c>.BASE <x/>`)).toBe(true);
    expect(refuses(`${declaring(16)}\n<a> <b> "c"base <x/>`)).toBe(true);
    expect(refuses(`${declaring(16)}\n<a> <b> <c>\t.@base<x/>.`)).toBe(true);
  });

  it("counts no declaration in a string, an IRI, a comment or a name, as the parser does not", () => {
    const quoted = [
      '"When the base < 2, the logarithm is undefined."',
      '"git rebase <main>"',
      "'BASE <x/>'",
      '"Database<br>"',
      '"""Write\n@base <../> .\nto go up."""',
      "'''@prefix ex: <x> .'''",
      '"a \\"quote\\" and base <x/>"',
      '"""a "" and ""\\""" base <x/>"""',
      '"an escaped backslash \\\\"',
    ];
    const cards = quoted.map((text) => `<a> <b> ${text} .\n`).join("");
    expect(refuses(cards.repeat(20))).toBe(false);
    expect(refuses("<a> <b> <base> .\n<a#base> <b> <c> .\n".repeat(20))).toBe(false);
    expect(refuses("ex:base <x/> .\n_:base <b> <x/> .\n".repeat(20))).toBe(false);
    expect(refuses("# BASE <x/>\n<a> <b> <c> .\n".repeat(20))).toBe(false);
    // A string with no end runs to the end of the text, as the parser reads it.
    expect(refuses(`<a> <b> "${"BASE <x/> ".repeat(20)}`)).toBe(false);
  });

  it("lets the longest of the URL and the absolute bases, the relative ones added on, come to 512 characters, and no more", () => {
    // Two characters of IRI each, between its < and its >.
    const url = `https://other.example/${"u".repeat(512 - 22 - 2 * 16)}`;
    expect(refuses(declaring(16), url)).toBe(false);
    expect(refuses(declaring(16), `${url}u`)).toBe(true);
    expect(refuses("<a> <b> <c> .", `${url}${"u".repeat(2 * 16)}`)).toBe(false);
    expect(refuses("<a> <b> <c> .", `${url}${"u".repeat(2 * 16 + 1)}`)).toBe(true);
    // An absolute base is the base on its own, whatever came before it.
    const iri = `https://other.example/${"a".repeat(512 - 22)}`;
    const absolute = `@base <${iri}> .\n`;
    expect(refuses(absolute.repeat(16))).toBe(false);
    expect(refuses(`@base <${iri}a> .\n`)).toBe(true);
    expect(refuses(`${absolute}@base <x> .`)).toBe(true);
  });

  it("finds the IRI of a base past white space and comments, as the parser does, and none in a string", () => {
    const long = `<http://e/${"a".repeat(600)}/>`;
    expect(refuses(`@base # <>\n${long} .`)).toBe(true);
    expect(refuses(`@base # <> \r${long} .`)).toBe(true);
    expect(refuses(`BASE #<a:b>\r\n  # base <>\n\t${long}`)).toBe(true);
    // A `base` in a string, with what looks like a comment next, hides none after it.
    expect(refuses(`<s> <p> "base # " .\n@base ${long} .`)).toBe(true);
    expect(refuses(`<s> <p> "base #base" . @base ${long} .`)).toBe(true);
  });

  it("refuses a base whose path has an empty segment or an escape, or a dot segment but in a relative path with no colon, and lets its authority, query and fragment be", () => {
    for (const iri of [
      "https://other.example/a/./b/",
      "https://other.example/a/../",
      "https://other.example/a/..",
      "https://other.example/.",
      "https://other.example/a//b/",
      "a//b/",
      ".//",
      // From the root, or with a colon, the parser keeps a segment after the colon.
      "/a/../",
      "/x:/../",
      "a/x:/../",
      "//other.example/a/",
      "https://other.example/a\\u002E\\u002E/",
    ]) {
      expect(refuses(`@base <${iri}> .`), iri).toBe(true);
    }
    for (const iri of [
      "https://other.example/a/b/",
      "https://other.example",
      "https://other.example?a/../b",
      "https://other.example/a.b/..c/.d/?q=/./#/../",
      "a.b/c..",
      "a/b?./..",
      "#./",
      // A relative base's dot segments the parser removes as it resolves it, as a document written by hand may have.
      "./",
      "./a/",
      "../",
      "a/.",
      "../../a/./b/",
    ]) {
      expect(refuses(`@base <${iri}> .`), iri).toBe(false);
    }
  });

  it("lets a text declare 4,096 prefixes, in any form, and no more", () => {
    const prefixForms = [
      "@prefix ex: <x> .",
      "PREFIX : <x>",
      "@prefix:<x>.",
      "prefix # a name next\n a.b-c: <x>",
      "PrEfIx\r\n# <>\r\té:\t<x>",
    ];
    const prefixes = (count: number) =>
      Array.from({ length: count }, (_, at) => prefixForms[at % prefixForms.length]).join("\n");
    expect(refuses(prefixes(4096))).toBe(false);
    expect(refuses(prefixes(4097))).toBe(true);
    // One in a string declares none, nor does the word as part of a name.
    expect(refuses(`<a> <b> "prefix ex: <x>" .\n${prefixes(4096)}`)).toBe(false);
    expect(refuses('<a> <b> "a prefix, the prefixes" .\n'.repeat(5000))).toBe(false);
    expect(refuses(`${"ex:prefixed ".repeat(5000)}`)).toBe(false);
  });

  it("counts a base with no IRI of 512 characters at most as past the limits, and a `base` with no IRI next as no declaration", () => {
    expect(refuses(`@base <${"a".repeat(10)}`)).toBe(true);
    expect(refuses("@base <a b> .")).toBe(true);
    expect(refuses("@base <a\\b> .")).toBe(true);
    expect(refuses("@base #<a>")).toBe(false);
    // An IRI with no end is no IRI to the parser.
    expect(refuses(`<a> <b> <c${"d".repeat(1000)} .\nBASE "x"`)).toBe(false);
    expect(refuses(`@base # a comment\n${"a".repeat(2048)}`)).toBe(false);
    expect(refuses("# a base camp, a database: <x>\n".repeat(100))).toBe(false);
  });

  it("refuses an IRI of more than 512 characters that is relative or may hold a dot segment, in a triple or a declaration, and lets a plain absolute one be", () => {
    const relative = "a".repeat(513);
    for (const text of [
      `<${relative}> <b> <c> .`,
      `<a> <${relative}> <c> .`,
      `<a> <b> <${relative}> .`,
      `<a> <b> "c"^^<${relative}> .`,
      `@prefix ex: <${relative}> .`,
      `PREFIX : <${relative}>`,
      `<a> <b> <c> .\n<#${relative}> <b> <c> .`,
      `</${relative}> <b> <c> .`,
      `<//other.example/${relative}> <b> <c> .`,
      // An absolute one with a dot segment, or an escape that could stand for one.
      `<https://other.example/${"a/".repeat(250)}../> <b> <c> .`,
      `<https://other.example/${"a/".repeat(250)}.?q> <b> <c> .`,
      `<https://other.example/${"a/".repeat(250)}\\u002E\\u002E/> <b> <c> .`,
      // One whose scheme is written as an escape is relative as it is written.
      `<\\u0068ttps://other.example/${relative}> <b> <c> .`,
    ]) {
      expect(refuses(text), text.slice(0, 40)).toBe(true);
    }
    for (const text of [
      `<${"a".repeat(512)}> <b> <c> .`,
      `<${"a/../".repeat(102)}ab> <b> <c> .`,
      `@prefix ex: <${"a".repeat(512)}> .`,
      `<https://other.example/${"a".repeat(5000)}> <b> <c> .`,
      `<https://other.example/${"a.b/..c/".repeat(500)}#.a> <b> <c> .`,
      `@prefix ex: <https://other.example/${"a".repeat(5000)}#> .`,
      // In a string or a comment, it is no IRI.
      `<a> <b> "<${relative}>" .`,
      `# <${relative}>\n<a> <b> <c> .`,
      // With no end, the parser stops at an error.
      `<a> <b> <${relative} .`,
    ]) {
      expect(refuses(text), text.slice(0, 40)).toBe(false);
    }
  });

  it("refuses a text at the part where a long relative IRI starts, and writes none of it", () => {
    const text = `${lines}<${"y/../".repeat(200_000)}> <b> <c> .\n${lines}`;
    const { wrote, written, ended } = writing(text, () => true);
    expect(wrote).toBe(false);
    expect(text.startsWith(written.join(""))).toBe(true);
    expect(written.join("").length).toBeLessThanOrEqual(lines.length);
    expect(ended).toBe(false);
  });

  it("lets a text nest 64 levels, by collections, blank nodes, annotations or triple terms, and no more", () => {
    for (const [opening, closing] of [
      ["(", ")"],
      ["[ <p> ", "]"],
      ["{| <p> ", "|}"],
      ["<< ", ">>"],
    ]) {
      const nested = (depth: number) =>
        `<a> <b> ${opening!.repeat(depth)}<c>${closing!.repeat(depth)} .\n`;
      expect(refuses(nested(64)), opening).toBe(false);
      expect(refuses(nested(65)), opening).toBe(true);
      // Levels closed are left: one after another, they don't add up.
      expect(refuses(nested(64).repeat(100)), opening).toBe(false);
    }
    // A level closed that was never opened makes no room for another.
    expect(refuses(`${")".repeat(100)}${"(".repeat(65)}`)).toBe(true);
  });

  it("counts no level in a string, an IRI or a comment, as the parser does not", () => {
    const quoted = [
      '"(((((((("',
      "'[[[[[[[['",
      '"""{{{{\n<<<<"""',
      "<https://other.example/((((((((>",
      "<https://other.example/[[[[[[[[>",
    ];
    const cards = quoted.map((text) => `<a> <b> ${text} .\n`).join("");
    expect(refuses(cards.repeat(20))).toBe(false);
    expect(refuses("# ((((((((\n<a> <b> <c> .\n".repeat(20))).toBe(false);
    // What the parser reads as no IRI, nor a closing `>>`, it stops at.
    expect(refuses("<a b> <c> > .\n".repeat(100))).toBe(false);
  });

  it("refuses a text at the part where it nests past the bound, and writes none of it", () => {
    for (const opening of ["(", "[ <p> "]) {
      const text = `<a> <b> ${opening.repeat(1_000_000)}`;
      const { wrote, written, ended } = writing(text, () => true);
      expect(wrote).toBe(false);
      expect(written).toEqual([]);
      expect(ended).toBe(false);
    }
  });

  it("refuses a long IRI with dot segments, and looks through short ones, in time that grows with the text, not its square", () => {
    // Eight times the text must take less than four times as long as an eighth of it done eight times over (testing.md).
    for (const text of [
      (count: number) => `<${"x/".repeat(count)}${"y/../".repeat(count)}> <b> <c> .`,
      (count: number) => `@prefix p: <${"y/../".repeat(count)}> .`,
      (count: number) => "<a/../b> <c/./d> <e> .\n".repeat(count),
    ]) {
      const ratio = growth(
        (count) => {
          const written = text(count);
          return () => refuses(written);
        },
        20_000,
        8,
      );
      expect(ratio).toBeLessThan(4);
    }
  });

  it("looks through a text in time that grows with it, not its square", () => {
    // Eight times the text must take less than four times as long as an eighth of it done eight times over (testing.md).
    for (const words of [
      // Many a `base` in comments, each with the rest of them to look past.
      "#base\n",
      "base #",
      // White space after each.
      "base \t ",
      // A name each, which runs on to the end of the text.
      "prefix",
      // Names in comments, each with the rest of them to look past.
      "# prefix prefixprefix",
      "#prefixprefix\nprefix",
      // Strings with no end, each with the rest of the text to look through.
      '"\\',
      "'''\\'",
      // IRIs with no end, each up to the next.
      "<a",
      // Levels opened and closed, and what the parser reads as no IRI.
      "( [ {| << >> |} ] ) ",
      "<a b> > ",
    ]) {
      const ratio = growth(
        (count) => {
          const text = words.repeat(count);
          return () => refuses(text);
        },
        20_000,
        8,
      );
      expect(ratio).toBeLessThan(4);
    }
  });
});

describe("quadTally", () => {
  it("says a triple with a term longer than the bound is past, with limits or with none", () => {
    // A literal is named in quotes, a blank node with `_:` before its label, a text with its language after it.
    const subject = namedNode(URL_);
    const label = "b".repeat(MAX_TERM_CHARACTERS - 2);
    const text = "t".repeat(MAX_TERM_CHARACTERS - 5);
    // An IRI is in `<>` and a text's quotes and line breaks are escaped, as N-Triples writes them.
    const within = [
      quadOf(subject, literal("x".repeat(MAX_TERM_CHARACTERS - 2))),
      quadOf(blankNode(label), literal("x")),
      quadOf(subject, literal(text, "sv")),
      quadOf(subject, namedNode("i".repeat(MAX_TERM_CHARACTERS - 2))),
      quadOf(subject, literal(`\n${"x".repeat(MAX_TERM_CHARACTERS - 4)}`)),
    ];
    const past = [
      quadOf(subject, literal("x".repeat(MAX_TERM_CHARACTERS - 1))),
      quadOf(blankNode(`${label}b`), literal("x")),
      quadOf(subject, literal(text, "sv-se")),
      quadOf(subject, namedNode("i".repeat(MAX_TERM_CHARACTERS - 1))),
      quadOf(subject, literal(`"${"x".repeat(MAX_TERM_CHARACTERS - 3)}`)),
    ];
    for (const limits of [undefined, RELEASE_LIMITS]) {
      expect(within.map(quadTally(limits))).toEqual([false, false, false, false, false]);
      expect(past.map(quadTally(limits))).toEqual([true, true, true, true, true]);
    }
  });

  it("counts the triples and their characters into what is spent, shared by tallies given the same", async () => {
    const quads = await parseQuads("<#a> <#p> 1, 2, 3 .", "turtle", URL_, RELEASE_LIMITS);
    const limits = { ...RELEASE_LIMITS, quads: 5 };
    const spent = noneSpent();
    const first = quadTally(limits, spent);
    const second = quadTally(limits, spent);
    expect(quads.map(first)).toEqual([false, false, false]);
    expect(spent.quads).toBe(3);
    expect(spent.characters).toBeGreaterThan(0);
    // Five triples at most, together.
    expect(quads.map(second)).toEqual([false, false, true]);
    // A tally of its own counts from none.
    expect(quads.map(quadTally(limits))).toEqual([false, false, false]);
  });
});
