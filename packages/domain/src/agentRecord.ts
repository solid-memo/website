// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { parseAuthor } from "./author";
import type { AgentV1 } from "@solid-memo/vocab/types.generated";
import { fnv1a } from "./fnv1a";
import { PathMap, TextMap } from "./pathKeys";
import { documentUrlOf } from "./subjectUrl";

/**
 * Who made a deck, between the "Name <email>" strings the app shows and
 * the foaf:Agent nodes deck format 3 names as its creators (see
 * docs/data-model.md). An agent is written beside what it made, in the
 * same document, named after the author: the same author is one node.
 */

const MAILTO = "mailto:";

/**
 * The agent node for an author, in the document of `subjectUrl`: a slug
 * of the name folded to ASCII. A name the folding loses letters or
 * digits of (김민수, Kim 민수, Groß), or all of them (—), gets a hash of
 * the whole name after its slug ("unnamed" for an empty one), so that
 * two such names stay two agents; a name that folds without loss keeps
 * its bare slug, as it always had. Other authors can fold to the same
 * node (punctuation and accents go): agentUrlsOf names the node an
 * author is written to.
 */
export function agentUrlOf(subjectUrl: string, author: string): string {
  return `${documentUrlOf(subjectUrl)}#agent-${agentFragmentOf(author).fragment}`;
}

/** The fragment of agentUrlOf, and whether it already ends in the author's hash. */
function agentFragmentOf(author: string): { fragment: string; hashed: boolean } {
  const folded = author
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const lossy = slug === "" || /[\p{L}\p{N}]/u.test(folded.replace(/[a-z0-9]/g, ""));
  return lossy
    ? { fragment: `${slug === "" ? "unnamed" : slug}-${authorHashOf(author)}`, hashed: true }
    : { fragment: slug, hashed: false };
}

function authorHashOf(author: string): string {
  return hashOf(author.trim().normalize("NFC"));
}

/**
 * What a node of an agent's document holds, as agentUrlsOf asks: null
 * when nothing of an agent is said there (any author may be written
 * onto it), an author's record, or "unreadable" for an agent this app
 * cannot read, which no author is written over.
 */
export type AgentHolder = AgentV1 | null | "unreadable";

/**
 * The agent node each of `authors` is written to, in the document of
 * `subjectUrl`: agentUrlOf's, unless that node holds another author,
 * then the first after it that does not. `holderAt` says what a node of
 * the document holds already (AgentHolder). The nodes after it are
 * agentUrlOf's with a hash of the whole author added (unless it has
 * one), then with the lowest count whose node is free or holds the
 * author. An author is never written over another one, whatever deck
 * named it first; the same author named twice is one node.
 *
 * The counted nodes of each hashed name are looked at once, however
 * many authors share it (countedUrl), so that the time grows with the
 * authors and the nodes, not their product: names that fold to one slug
 * and share a hash are easy to make. A node's URL, joined from the
 * document and the author's name, can be longer than any term, so no
 * map here is keyed by it as one string (TextMap).
 */
export function agentUrlsOf(
  subjectUrl: string,
  authors: readonly string[],
  holderAt: (url: string) => AgentHolder = () => null,
): string[] {
  const taken = new TextMap<AgentV1>();
  const holderOf = (url: string): AgentHolder => taken.get(url) ?? holderAt(url);
  const counted = new TextMap<CountedNodes>();
  return authors.map((author) => {
    const record = agentToRecord(author);
    const free = (url: string) => {
      const holder = holderOf(url);
      return holder === null || (holder !== "unreadable" && sameAgent(holder, record));
    };
    const first = agentUrlOf(subjectUrl, author);
    const hashed = agentFragmentOf(author).hashed ? first : `${first}-${authorHashOf(author)}`;
    let url: string;
    if (free(first)) url = first;
    else if (free(hashed)) url = hashed;
    else {
      const nodes = counted.get(hashed) ?? { next: 2, holders: new PathMap() };
      counted.set(hashed, nodes);
      url = countedUrl(hashed, record, nodes, holderOf);
    }
    taken.set(url, record);
    return url;
  });
}

/**
 * The counted nodes of one hashed name looked at so far: every count
 * from 2 to before `next` holds an author or an agent no author is
 * written over, and `holders` gives the lowest of them each author
 * holds. A node that holds an author keeps holding that author.
 */
interface CountedNodes {
  next: number;
  holders: PathMap<number>;
}

/**
 * The lowest counted node of `hashed` that is free or holds `record`'s
 * author: one the nodes looked at hold, else the next ones are looked
 * at, each once.
 */
function countedUrl(
  hashed: string,
  record: AgentV1,
  nodes: CountedNodes,
  holderOf: (url: string) => AgentHolder,
): string {
  const key = agentPath(record);
  const held = nodes.holders.get(key);
  if (held !== undefined) return `${hashed}-${held}`;
  for (;;) {
    const count = nodes.next++;
    const holder = holderOf(`${hashed}-${count}`) ?? record;
    if (holder === "unreadable") continue;
    const holds = agentPath(holder);
    if (!nodes.holders.has(holds)) nodes.holders.set(holds, count);
    if (sameAgent(holder, record)) return `${hashed}-${count}`;
  }
}

/** One path (PathMap) per author, as sameAgent tells them apart. */
function agentPath(record: AgentV1): string[] {
  return record.mbox === undefined ? [record.name] : [record.name, record.mbox];
}

/** Whether two agent records name the same author: the same name and the same mailbox, or none. */
export function sameAgent(a: AgentV1, b: AgentV1): boolean {
  return a.name === b.name && a.mbox === b.mbox;
}

/** Six hex digits of the 32-bit FNV-1a hash of `text` (fnv1a). */
function hashOf(text: string): string {
  return fnv1a(text).toString(16).padStart(8, "0").slice(0, 6);
}

export function agentToRecord(author: string): AgentV1 {
  const { name, email } = parseAuthor(author);
  return { name, ...(email === undefined ? {} : { mbox: `${MAILTO}${email}` }) };
}

export function authorFromAgentRecord(record: AgentV1): string {
  return record.mbox?.startsWith(MAILTO)
    ? `${record.name} <${record.mbox.slice(MAILTO.length)}>`
    : record.name;
}
