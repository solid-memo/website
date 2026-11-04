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
 * of them, never one string.
 */

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
