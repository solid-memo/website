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

/**
 * The longest node agentUrlsOf can write `author` to in the document of
 * `subjectUrl`: agentUrlOf's with the author's hash added (unless it has
 * one), then the longest count a node can take after it.
 */
export function longestAgentUrlOf(subjectUrl: string, author: string): string {
  const first = agentUrlOf(subjectUrl, author);
  const hashed = agentFragmentOf(author).hashed ? first : `${first}-${authorHashOf(author)}`;
  return `${hashed}-${Number.MAX_SAFE_INTEGER}`;
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
 * many authors share it (AgentNodes), so that the time grows with the
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
  return agentNodesOf(holderAt).urlsOf(subjectUrl, authors);
}

/**
 * The agent nodes of a dataset, as agentUrlsOf names them for one
 * subject after another: what the counted nodes hold is looked at once
 * for all of them, so that many decks of one document that share an
 * author take time that grows with the decks and the nodes, not their
 * product. urlsOf gives each call the nodes agentUrlsOf would give it
 * on its own; when a node is written between two calls, `written` has
 * what it holds looked at again.
 */
export interface AgentNodes {
  urlsOf(subjectUrl: string, authors: readonly string[]): string[];
  written(url: string): void;
}

/** AgentNodes over the nodes whose holders `holderAt` gives. */
export function agentNodesOf(holderAt: (url: string) => AgentHolder): AgentNodes {
  const counted = new TextMap<CountedNodes>();
  const looked = new TextMap<LookedNode>();
  const look = (nodes: CountedNodes): void => {
    const count = nodes.next++;
    const node = { nodes, count, holder: holderAt(`${nodes.hashed}-${count}`) };
    looked.set(`${nodes.hashed}-${count}`, node);
    place(node, insertCount);
  };
  return {
    urlsOf(subjectUrl, authors) {
      const taken = new TextMap<AgentV1>();
      const freeTaken = new Map<CountedNodes, FreeTaken>();
      const holderOf = (url: string): AgentHolder => taken.get(url) ?? holderAt(url);
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
          const nodes = counted.get(hashed) ?? {
            hashed,
            next: 2,
            holders: new PathMap(),
            free: [],
          };
          counted.set(hashed, nodes);
          const call = freeTaken.get(nodes) ?? { taken, at: 0, holders: new PathMap() };
          freeTaken.set(nodes, call);
          url = countedUrl(nodes, record, call, look);
        }
        taken.set(url, record);
        return url;
      });
    },
    written(url) {
      const node = looked.get(url);
      if (node === undefined) return;
      const holder = holderAt(url);
      if (sameHolder(holder, node.holder)) return;
      place(node, removeCount);
      node.holder = holder;
      place(node, insertCount);
    },
  };
}

/**
 * The counted nodes of one hashed name looked at so far: every count
 * from 2 to before `next`, the ones free in `free` and the ones that
 * hold an author under that author in `holders`, each list from the
 * lowest count up. An agent no author is written over is in neither.
 */
interface CountedNodes {
  hashed: string;
  next: number;
  holders: PathMap<number[]>;
  free: number[];
}

/** A counted node looked at, and what it held then. */
interface LookedNode {
  nodes: CountedNodes;
  count: number;
  holder: AgentHolder;
}

/**
 * The free counted nodes of one hashed name that the authors of one
 * call took (`taken`, by URL): every free count before `at` is taken,
 * and `holders` gives the lowest of them each author took.
 */
interface FreeTaken {
  taken: TextMap<AgentV1>;
  at: number;
  holders: PathMap<number>;
}

/**
 * The lowest counted node of `nodes` that is free or holds `record`'s
 * author, `call` saying which free nodes the authors before it in the
 * same call were given: the lowest the nodes looked at hold, have free
 * or gave this author, else the next ones are looked at (`look`), each
 * once.
 */
function countedUrl(
  nodes: CountedNodes,
  record: AgentV1,
  call: FreeTaken,
  look: (nodes: CountedNodes) => void,
): string {
  const key = agentPath(record);
  for (;;) {
    for (let count = nodes.free[call.at]; count !== undefined; count = nodes.free[++call.at]) {
      const taker = call.taken.get(`${nodes.hashed}-${count}`);
      if (taker === undefined) break;
      const path = agentPath(taker);
      call.holders.set(path, call.holders.get(path) ?? count);
    }
    const counts = [nodes.free[call.at], nodes.holders.get(key)?.[0], call.holders.get(key)];
    const found = counts.filter((count) => count !== undefined);
    if (found.length > 0) return `${nodes.hashed}-${Math.min(...found)}`;
    look(nodes);
  }
}

/** Puts a looked-at node's count in, or takes it out of (`change`), the list of what it holds. */
function place(node: LookedNode, change: (counts: number[], count: number) => void): void {
  const { nodes, count, holder } = node;
  if (holder === "unreadable") return;
  if (holder === null) {
    change(nodes.free, count);
    return;
  }
  const key = agentPath(holder);
  const counts = nodes.holders.get(key) ?? [];
  nodes.holders.set(key, counts);
  change(counts, count);
}

/** Inserts `count` into the ascending `counts`, from the end: a count looked at for the first time is the highest. */
function insertCount(counts: number[], count: number): void {
  let at = counts.length;
  while (at > 0 && counts[at - 1]! > count) at--;
  counts.splice(at, 0, count);
}

/** Takes `count` out of `counts`, keeping the rest in order; a count that is not there leaves them as they are. */
function removeCount(counts: number[], count: number): void {
  let to = 0;
  for (const kept of counts) if (kept !== count) counts[to++] = kept;
  counts.length = to;
}

/** Whether two holders say the same of a node. */
function sameHolder(a: AgentHolder, b: AgentHolder): boolean {
  return a === null || b === null || a === "unreadable" || b === "unreadable"
    ? a === b
    : sameAgent(a, b);
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
