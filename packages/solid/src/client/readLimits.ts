// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Quad, Term } from "@rdfjs/types";
import { ReadLimitError, type ReadLimits } from "./interface";

/**
 * The most the app reads of a release: a wide margin over the largest
 * release in the library (decks/), about 2.4 MB, 40,000 triples and 8.5
 * million characters of terms. A release is anyone's to make, one added
 * from a link is read as soon as its link is opened, and the app keeps
 * every triple of what it reads, so one with no end would hold the tab
 * until it ran out of memory.
 */
export const RELEASE_LIMITS: ReadLimits = {
  bytes: 32 * 1024 * 1024,
  quads: 400_000,
  characters: 64 * 1024 * 1024,
};

/** Each response limitedFetch gave: the limits it is read under, and how it went past them, once it did. */
const READS = new WeakMap<Response, { limits: ReadLimits; refused?: ReadLimitError }>();

/**
 * The fetch, its answers read under `limits`: a body larger than they
 * allow fails as it is read, once past the limit, or at once with a
 * ReadLimitError when its Content-Length says so, and the request is
 * canceled. A body read fails as the browser fails it, so the reason is
 * kept apart (refusalOf). The triples are counted where the body is
 * parsed (getSolidDatasetLinear), which asks limitsOf for the response's.
 */
export function limitedFetch(
  fetch: typeof globalThis.fetch,
  limits: ReadLimits,
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    if (response.body === null) return response;
    const { url } = response;
    if (Number(response.headers.get("Content-Length")) > limits.bytes) {
      await response.body.cancel();
      throw new ReadLimitError(url, limits);
    }
    const read: { limits: ReadLimits; refused?: ReadLimitError } = { limits };
    let bytes = 0;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          bytes += chunk.byteLength;
          if (bytes <= limits.bytes) return controller.enqueue(chunk);
          read.refused = new ReadLimitError(url, limits);
          controller.error(read.refused);
        },
      }),
    );
    const limited = new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
    // A response made here has no URL of its own; the library names the document by it.
    Object.defineProperty(limited, "url", { value: url });
    READS.set(limited, read);
    return limited;
  };
}

/** The limits a response is read under: limitedFetch's, or none. */
export function limitsOf(response: Response): ReadLimits | undefined {
  return READS.get(response)?.limits;
}

/** Why the body of a response limitedFetch gave failed to be read: past its limit; undefined when it was not, or there was no response. */
export function refusalOf(response: Response | undefined): ReadLimitError | undefined {
  return response === undefined ? undefined : READS.get(response)?.refused;
}

/**
 * A tally of the triples parsed under `limits`, and of the characters of
 * their terms (subject, predicate, object with its datatype and
 * language, graph): a prefix lets a short line of Turtle, or a context
 * a short line of JSON-LD, stand for terms as long as it is, so a
 * document's bytes do not bound what its triples hold. Each call counts
 * one triple, and says whether the count is now past either limit; never
 * with no limits.
 */
export function quadTally(limits: ReadLimits | undefined): (quad: Quad) => boolean {
  if (limits === undefined) return () => false;
  let quads = 0;
  let characters = 0;
  return ({ subject, predicate, object, graph }) => {
    quads++;
    characters += length(subject) + length(predicate) + length(object) + length(graph);
    return quads > limits.quads || characters > limits.characters;
  };
}

function length(term: Term): number {
  if (term.termType !== "Literal") return term.value.length;
  return term.value.length + term.datatype.value.length + term.language.length;
}

/** How many characters of a text a parser is written at a time (textChunks). */
const TEXT_CHUNK = 4096;

/**
 * A text in parts of TEXT_CHUNK characters, none ending inside a
 * character (a surrogate pair), for a streaming parser to be written one
 * part at a time. A parser written the whole text in one call goes on
 * through all of it after the tally is past its limits; one written in
 * parts can be stopped (destroyed) between them, with the rest unread.
 */
export function textChunks(text: string): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; ) {
    let end = start + TEXT_CHUNK;
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end++;
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
