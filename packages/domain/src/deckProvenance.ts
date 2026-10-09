import { agentUrlOf } from "./agentRecord";
import { AppError } from "./appError";
import { parseAuthor } from "./author";
import type { Deck } from "./deck";
import { chosenLicense } from "./license";

/**
 * Who made a deck and under what terms: its authors, each "Name" or
 * "Name <email>" (dcterms:creator, a foaf:Agent node each), and its
 * licence (dcterms:license), none when it states none.
 */
export interface DeckProvenance {
  authors: readonly string[];
  license?: string;
}

/**
 * The deck with its authors and licence as an edit gives them. Each
 * author is tidied ("Name <email>", spaces trimmed), and one left empty
 * is dropped; one with an address but no name is refused (authorEmpty),
 * as is one named twice (authorTwice): two authors written to the same
 * agent node (agentUrlOf) would be one. The licence is none, one of
 * KNOWN_LICENSES, or the one the deck has (chosenLicense).
 */
export function withProvenance(deck: Deck, provenance: DeckProvenance): Deck {
  const authors: string[] = [];
  const agents = new Set<string>();
  for (const typed of provenance.authors) {
    if (typed.trim() === "") continue;
    const { name, email } = parseAuthor(typed);
    if (name === "" || name === email) throw new AppError("authorEmpty");
    const author = email === undefined ? name : `${name} <${email}>`;
    const agent = agentUrlOf(deck.url, author);
    if (agents.has(agent)) throw new AppError("authorTwice", { author: name });
    agents.add(agent);
    authors.push(author);
  }
  const license = chosenLicense(provenance.license, deck.license);
  const { license: _dropped, ...rest } = deck;
  return { ...rest, authors, ...(license === undefined ? {} : { license }) };
}
