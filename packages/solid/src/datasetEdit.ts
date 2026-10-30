// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { type Dataset, type NamedSubject, getThing, setThings } from "./client/rdf";

/**
 * Edits of a dataset made a subject at a time, and made to the dataset
 * at once (setThings): a write of many subjects (a deck's cards, a
 * document brought to this app's format) takes time that grows with
 * them and the document, where a setThing at each would copy the whole
 * document every time, in the square of its subjects. A read sees the
 * edits made so far.
 */
export interface DatasetEdit<T extends Dataset> {
  /** The subject at `url`, as edited so far; null when there is none. */
  getThing(url: string): NamedSubject | null;
  /** Sets a subject with a URL of its own in place of what was said of it. */
  setThing(subject: NamedSubject): void;
  /** The dataset with every edit made, each change recorded (changesOf). */
  done(): T;
}

/** Edits of `dataset`, none made yet. */
export function editOf<T extends Dataset>(dataset: T): DatasetEdit<T> {
  // The last edit of each subject, by its URL.
  const edits = new Map<string, NamedSubject>();
  return {
    getThing: (url) => edits.get(url) ?? getThing(dataset, url),
    setThing: (subject) => {
      edits.set(subject.url, subject);
    },
    done: () => setThings(dataset, edits.values()),
  };
}
