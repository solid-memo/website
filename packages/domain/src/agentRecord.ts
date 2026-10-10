import { parseAuthor } from "./author";
import type { AgentV1 } from "@solid-memo/vocab/types.generated";
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
 * its bare slug, as it always had.
 */
export function agentUrlOf(subjectUrl: string, author: string): string {
  const folded = author
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const slug = folded.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const lossy = slug === "" || /[\p{L}\p{N}]/u.test(folded.replace(/[a-z0-9]/g, ""));
  const fragment = lossy ? `${slug === "" ? "unnamed" : slug}-${hashOf(author.trim().normalize("NFC"))}` : slug;
  return `${documentUrlOf(subjectUrl)}#agent-${fragment}`;
}

/** Six hex digits of the 32-bit FNV-1a hash of `text`'s UTF-16 code units: stable, not secret. */
function hashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 6);
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
