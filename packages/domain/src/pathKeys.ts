// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Maps and keys by a path of strings, such as a quad's terms, each
 * string a key of its own. V8 hashes a string longer than 16,383
 * characters by its length alone, so a Map or Set keyed by many such
 * strings of one length finds a key only by comparing it with every
 * other, in time that grows with the square of their number. A term the
 * app reads is held to that length (MAX_TERM_CHARACTERS); strings
 * joined from several could be past it, so a key of several is a path
 * of them, never one string. Text made from a term, such as the plain
 * text of a text in Markdown, can be longer than the term: it is keyed
 * by its pieces (piecesOf). A string joined elsewhere, whose parts the
 * code that keys it does not have, is a key of pieces (TextMap).
 */

/** The most characters of a string V8 hashes all of: the bound on a term (MAX_TERM_CHARACTERS). */
export const HASHED_CHARACTERS = 16_383;

/** What a term's longest name holds beside an IRI or a blank node's label: `_:` before it, or `<>` around it. */
export const TERM_NAME_ROOM = 2;

const QUOTE = 0x22;
const NEWLINE = 0x0a;
const RETURN = 0x0d;
const ESCAPE = 0x5c;

/**
 * How many characters of a literal's text N-Triples escapes, each one
 * written as two: `"`, `\`, a line feed and a carriage return. A term's
 * longest name counts them twice (termKeyLength in the solid package).
 */
export function escapedCharacters(value: string): number {
  let count = 0;
  for (let at = 0; at < value.length; at++) {
    const code = value.charCodeAt(at);
    if (code === QUOTE || code === ESCAPE || code === NEWLINE || code === RETURN) count++;
  }
  return count;
}

/** Whether an IRI is longer than a term may be, as in `<>`: no document read or written holds one. */
export function isIriPastBound(iri: string): boolean {
  return iri.length + TERM_NAME_ROOM > HASHED_CHARACTERS;
}

/** A step of a path (PathMap): the steps that go on from it, and the value of the path that ends there. */
interface PathStep<V> {
  readonly next: Map<string, PathStep<V>>;
  held: boolean;
  value?: V;
}

const stepOf = <V>(): PathStep<V> => ({ next: new Map(), held: false });

/** A map from paths of strings: two paths are the same key when each of their steps is. */
export class PathMap<V> {
  readonly #root = stepOf<V>();
  /** The steps that end a path it holds, in the order each was first set. */
  readonly #held: PathStep<V>[] = [];

  /** How many paths it holds. */
  get size(): number {
    return this.#held.length;
  }

  /** The values, in the order their paths were first set. */
  *values(): IterableIterator<V> {
    for (const step of this.#held) yield step.value as V;
  }

  #find(path: readonly string[]): PathStep<V> | undefined {
    let step: PathStep<V> | undefined = this.#root;
    for (const part of path) {
      step = step.next.get(part);
      if (step === undefined) return undefined;
    }
    return step;
  }

  has(path: readonly string[]): boolean {
    return this.#find(path)?.held === true;
  }

  get(path: readonly string[]): V | undefined {
    return this.#find(path)?.value;
  }

  set(path: readonly string[], value: V): this {
    let step = this.#root;
    for (const part of path) {
      let next = step.next.get(part);
      if (next === undefined) {
        next = stepOf();
        step.next.set(part, next);
      }
      step = next;
    }
    if (!step.held) this.#held.push(step);
    step.held = true;
    step.value = value;
    return this;
  }
}

/** A string as a path (PathMap) of pieces short enough for V8 to hash all of: the same path only for the same string. */
export function piecesOf(text: string): string[] {
  const pieces: string[] = [];
  for (let start = 0; start < text.length; start += HASHED_CHARACTERS) {
    pieces.push(text.slice(start, start + HASHED_CHARACTERS));
  }
  return pieces;
}

/**
 * A map from strings of any length, such as an IRI joined from a
 * document and a fragment, each kept as the path of its pieces: its
 * time grows with the strings' number however long they are.
 */
export class TextMap<V> {
  readonly #paths = new PathMap<V>();

  /** The values, in the order their strings were first set. */
  values(): IterableIterator<V> {
    return this.#paths.values();
  }

  has(text: string): boolean {
    return this.#paths.has(piecesOf(text));
  }

  get(text: string): V | undefined {
    return this.#paths.get(piecesOf(text));
  }

  set(text: string, value: V): this {
    this.#paths.set(piecesOf(text), value);
    return this;
  }
}

/** Keys for paths of strings (PathMap): the same number for the same path, a new one for a new path. */
export function pathKeys(): (path: readonly string[]) => number {
  const keys = new PathMap<number>();
  return (path) => {
    let key = keys.get(path);
    if (key === undefined) {
      key = keys.size;
      keys.set(path, key);
    }
    return key;
  };
}

/**
 * A value of JSON (strings, numbers, booleans, null, arrays and records)
 * as a path (PathMap): the same path for two that are alike, a field
 * that is undefined left out, as JSON.stringify leaves it. Each string
 * is a step of its own, after a step that says what it is; an array or
 * a record says how many items it has, so no two that differ share a
 * path.
 */
export function jsonPath(value: unknown): string[] {
  if (Array.isArray(value)) return ["array", String(value.length), ...value.flatMap(jsonPath)];
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, one]) => one !== undefined);
    return [
      "record",
      String(entries.length),
      ...entries.flatMap(([key, one]) => [key, ...jsonPath(one)]),
    ];
  }
  return [typeof value, String(value)];
}
