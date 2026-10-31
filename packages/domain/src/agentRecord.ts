// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { parseAuthor } from "./author";
import type { AgentV1 } from "@solid-memo/vocab/types.generated";
import { fnv1a } from "./fnv1a";
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
 * The agent node each of `authors` is written to, in the document of
 * `subjectUrl`: agentUrlOf's, unless that node holds another author,
 * then the first after it that does not. `fits` says whether a node of
 * the document may hold the author's record (nothing of an agent is said
 * there, or the same author is). The nodes after it are agentUrlOf's
 * with a hash of the whole author added (unless it has one), then with
 * a count too. An author is never written over another one, whatever
 * deck named it first; the same author named twice is one node.
 */
export function agentUrlsOf(
  subjectUrl: string,
  authors: readonly string[],
  fits: (url: string, record: AgentV1) => boolean = () => true,
): string[] {
  const taken = new Map<string, AgentV1>();
  return authors.map((author) => {
    const record = agentToRecord(author);
    const free = (url: string) => {
      const held = taken.get(url);
      return held === undefined ? fits(url, record) : sameAgent(held, record);
    };
    const first = agentUrlOf(subjectUrl, author);
    const hashed = agentFragmentOf(author).hashed ? first : `${first}-${authorHashOf(author)}`;
    let url = free(first) ? first : hashed;
    for (let count = 2; !free(url); count++) url = `${hashed}-${count}`;
    taken.set(url, record);
    return url;
  });
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
