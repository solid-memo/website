// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { BlankNode, DataFactory, Quad, Term } from "@rdfjs/types";
import { HASHED_CHARACTERS, TERM_NAME_ROOM } from "@solid-memo/domain/pathKeys";
import { ReadLimitError, type ReadLimits } from "./interface";

/** Keys for paths of terms, each term a key of its own, for the client modules and the alternative client. */
export { pathKeys } from "@solid-memo/domain/pathKeys";

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

/**
 * The most the app reads of an instance's document outside the user's
 * storages (ownPodGate.ts), read as no one or, in an instance they
 * registered on another server, as them, and of an instance's meta
 * document anywhere: as much as of a release (RELEASE_LIMITS), which
 * holds a deck's cards as an instance's largest documents do. An
 * instance anyone may make can be added by its address or registered by
 * another app, a catalog may name a deck's documents on any server, and
 * the app keeps every triple of what it reads; all of them together
 * are held to FOREIGN_READS_BUDGET too. The user's storages are
 * read with no limits but on their declarations and nesting
 * (writeTurtle) and on the length of each term (MAX_TERM_CHARACTERS).
 */
export const FOREIGN_LIMITS: ReadLimits = RELEASE_LIMITS;

/**
 * The most subjects an access control the app reads as it makes a
 * release public may have (solidReleasePublisher.ts): its rules, and
 * the nodes they name, a few in any ACL or ACR. The grant's library
 * copies the access control for each subject it parses and edits, in
 * time that grows with the square of their number, so one with more is
 * refused before the library is handed it. The grant reads the access
 * control again once written, so the subjects its rule adds count too.
 */
export const MAX_ACCESS_CONTROL_SUBJECTS = 64;

/**
 * The most the app reads of a release's access control as it makes the
 * release public (solidReleasePublisher.ts), on a server that may be
 * anyone's: an ACL or ACR holds a few rules, so a wide margin over that
 * is far less than a release may be. The grant's library parses and
 * edits an access control in time that grows with the square of its
 * subjects, so the margin is kept small, and the subjects are bounded
 * too (MAX_ACCESS_CONTROL_SUBJECTS), every subject the text states
 * counted, one a read leaves out as well, since the library reads the
 * text itself.
 */
export const ACCESS_CONTROL_LIMITS: ReadLimits = {
  bytes: 256 * 1024,
  quads: 1_000,
  characters: 1024 * 1024,
  subjects: MAX_ACCESS_CONTROL_SUBJECTS,
};

/**
 * The most the app reads of a WebID document, and of the documents it
 * names as more of the profile all together, as it looks for the user's
 * storages (solidStorageGateway.ts): at every sign-in, and again as the
 * credential gate asks. Every other read of the profile's documents is
 * held to them too: the identity provider's lookup
 * (solidSessionGateway.ts), the WebID document's own view
 * (solidWebIdDocumentRepository.ts) and the type index lookup
 * (typeIndex.ts), which runs at every load as the app lists the
 * instances. That lookup holds each document to them on its own, and
 * reads no more than MAX_PROFILE_DOCUMENTS of those the WebID document
 * names. A profile holds a few dozen triples, so a wide margin over
 * that is far less than a release may be, and no profile holds up a
 * sign-in or a load.
 */
export const PROFILE_LIMITS: ReadLimits = {
  bytes: 1024 * 1024,
  quads: 10_000,
  characters: 4 * 1024 * 1024,
};

/**
 * The most documents the app reads that a WebID document names as more
 * of the profile, as it looks for the user's storages: a profile names
 * one or two, and those past the first MAX_PROFILE_DOCUMENTS sent are
 * left out. One outside the profile's places, never sent, does not count.
 */
export const MAX_PROFILE_DOCUMENTS = 16;

/**
 * What a read with no limits is refused under, by the bounds every read
 * keeps: a Turtle text's base and prefix declarations, its long IRIs
 * that the parser resolves and how deep it nests (writeTurtle), and the
 * length of each term (MAX_TERM_CHARACTERS). Its body, its triples and
 * the characters of all their terms are not bounded.
 */
export const NO_SIZE_LIMITS: ReadLimits = {
  bytes: Number.POSITIVE_INFINITY,
  quads: Number.POSITIVE_INFINITY,
  characters: Number.POSITIVE_INFINITY,
};

/** The statuses whose responses have no body (Fetch Standard, "null body status"). */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * How much reads have taken in so far of the limits they share
 * (limitedFetch with `spent`): every read counts in the same tally, and
 * each is past the limits once the tally of all of them is.
 */
export interface ReadsSpent {
  bytes: number;
  quads: number;
  characters: number;
}

/**
 * The limits a read went past, `bytes` more taken in, for each tally
 * that stands for more than one set of them (sharedReadBudget); those
 * it is read under for any other.
 */
const PAST = new WeakMap<ReadsSpent, (bytes: number) => ReadLimits>();

/** Nothing taken in yet. */
export function noneSpent(): ReadsSpent {
  return { bytes: 0, quads: 0, characters: 0 };
}

/**
 * The limits to name in the ReadLimitError of a read past `limits`, with
 * `bytes` more taken in: the ones the tally names (PAST), or
 * `limits`, or NO_SIZE_LIMITS for a read with none.
 */
export function limitsPast(
  limits: ReadLimits | undefined,
  spent: ReadsSpent | undefined,
  bytes = 0,
): ReadLimits {
  return (spent === undefined ? undefined : PAST.get(spent)?.(bytes)) ?? limits ?? NO_SIZE_LIMITS;
}

/** Each response limitedFetch gave: the limits it is read under, what is spent of them, and how it went past them, once it did. */
const READS = new WeakMap<
  Response,
  { limits: ReadLimits; spent: ReadsSpent; refused?: ReadLimitError }
>();

/**
 * The fetch, its answers read under `limits`: a body larger than they
 * allow fails as it is read, once past the limit, or at once with a
 * ReadLimitError when its Content-Length says so, and the request is
 * canceled. A body read fails as the browser fails it, so the reason is
 * kept apart (refusalOf). The triples are counted where the body is
 * parsed (getSolidDatasetLinear), which asks limitsOf for the response's,
 * and spentOf for what is spent of them. Each answer has the limits to
 * itself, unless `spent` is given: then all of them share the limits,
 * each counting what it takes in into `spent`, a read refused too.
 */
export function limitedFetch(
  fetch: typeof globalThis.fetch,
  limits: ReadLimits,
  spent?: ReadsSpent,
): typeof globalThis.fetch {
  return async (input, init) => {
    const response = await fetch(input, init);
    // A status with no body (a 304 to a conditional read) has nothing to limit, and no response with a body can be made of it.
    if (response.body === null || NULL_BODY_STATUSES.has(response.status)) return response;
    const { url } = response;
    const tally = spent ?? noneSpent();
    const said = Number(response.headers.get("Content-Length"));
    if (tally.bytes + said > limits.bytes) {
      await response.body.cancel();
      throw new ReadLimitError(url, limitsPast(limits, tally, said));
    }
    const read: { limits: ReadLimits; spent: ReadsSpent; refused?: ReadLimitError } = {
      limits,
      spent: tally,
    };
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          tally.bytes += chunk.byteLength;
          if (tally.bytes <= limits.bytes) return controller.enqueue(chunk);
          read.refused = new ReadLimitError(url, limitsPast(limits, tally));
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

/**
 * The most the reads of documents outside the user's storages take in
 * together in a page session (foreignReads), on top of FOREIGN_LIMITS on
 * each: four times what one release may hold, so many times the largest
 * release in the library. A catalog may name a thousand decks, each with
 * two documents as large as a release, and the app holds every triple of
 * what it reads while it reads it. Once read, a document counts once, by
 * its largest read, while reads of it again come out of FOREIGN_REREADS.
 */
export const FOREIGN_READS_BUDGET: ReadLimits = {
  bytes: 4 * RELEASE_LIMITS.bytes,
  quads: 4 * RELEASE_LIMITS.quads,
  characters: 4 * RELEASE_LIMITS.characters,
};

/**
 * How much reads of documents already read may take in a page session
 * without counting in FOREIGN_READS_BUDGET, up to each one's largest
 * read: twice that budget. Past it they count whole, or many decks
 * naming one document could read it again and again without limit.
 */
export const FOREIGN_REREADS: ReadLimits = {
  bytes: 2 * FOREIGN_READS_BUDGET.bytes,
  quads: 2 * FOREIGN_READS_BUDGET.quads,
  characters: 2 * FOREIGN_READS_BUDGET.characters,
};

/**
 * The most the reads in the instances a user registered outside their
 * storages take in together in a page session, over all their servers:
 * four times the budget each server has of its own, so a server that
 * spends its own leaves room for others, and a type index naming many
 * servers still ends here. They have one FOREIGN_REREADS between them.
 */
export const INSTANCE_READS_TOTAL: ReadLimits = {
  bytes: 4 * FOREIGN_READS_BUDGET.bytes,
  quads: 4 * FOREIGN_READS_BUDGET.quads,
  characters: 4 * FOREIGN_READS_BUDGET.characters,
};

const SPENT_KEYS = ["bytes", "quads", "characters"] as const;

/** The methods that read, which a read budget counts; any other request is sent as it is asked. */
const BUDGETED_METHODS = new Set(["GET", "HEAD"]);

/** What one budget of sharedReadBudget has spent so far. */
interface BudgetSpent {
  /** What the reads have taken in of the budget. */
  session: ReadsSpent;
  /** What is left of `rereads`. */
  free: ReadsSpent;
  /** The largest read of each document so far. */
  largest: Map<string, ReadsSpent>;
}

/**
 * Reads under one budget together, as the reads of releases from a link
 * are (solidDeckLibrary.ts): what it gives makes a fetch whose answers
 * are each read under `limits` (limitedFetch), and its reads (GET and
 * HEAD), through every fetch it made, within `budget` too. With `scope`,
 * each scope it names a read's address by has a budget of its own, and
 * `total`, when given, bounds what all of them take together. A
 * document counts in the budget by its largest read; what a read of it
 * again takes within that comes out of `rereads` while that lasts, one
 * allowance over all the scopes when there is a `total`. Once
 * the budget is spent, a read under way fails as it goes on, and any
 * after it fails at once, without asking the server, with a
 * ReadLimitError naming the budget, until the page is loaded again. A
 * request that writes is sent whatever is spent, its answer under
 * `limits` alone.
 */
export function sharedReadBudget({
  limits,
  budget,
  rereads,
  scope = () => "",
  total = NO_SIZE_LIMITS,
}: {
  limits: ReadLimits;
  budget: ReadLimits;
  rereads: ReadLimits;
  /** The budget a read of an address counts in: one for all of them unless given. */
  scope?: (url: string) => string;
  /** What the reads of every scope may take together, reads again past `rereads` too: no limit of its own unless given. */
  total?: ReadLimits;
}): (fetch: typeof globalThis.fetch) => typeof globalThis.fetch {
  const budgets = new Map<string, BudgetSpent>();
  const allSpent = noneSpent();
  const allFree = total === NO_SIZE_LIMITS ? undefined : { ...rereads };
  const budgetOf = (url: string): BudgetSpent => {
    const key = scope(url);
    const found = budgets.get(key);
    if (found !== undefined) return found;
    const made: BudgetSpent = {
      session: noneSpent(),
      free: allFree ?? { ...rereads },
      largest: new Map(),
    };
    budgets.set(key, made);
    return made;
  };
  return (fetch) => async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    if (!BUDGETED_METHODS.has(method)) return limitedFetch(fetch, limits)(input, init);
    const { session, free, largest } = budgetOf(url);
    if (SPENT_KEYS.some((key) => session[key] > budget[key])) throw new ReadLimitError(url, budget);
    if (SPENT_KEYS.some((key) => allSpent[key] > total[key])) throw new ReadLimitError(url, total);
    const most = largest.get(url) ?? noneSpent();
    largest.set(url, most);
    const document = noneSpent();
    // limitedFetch compares one tally with `limits`: this read's own, or what a budget leaves of them, whichever is
    // more, so it is past them once any is past its limit, and names the budget when it is the one past.
    const over = (tally: ReadsSpent, bounds: ReadLimits, bytes: number) =>
      SPENT_KEYS.some((key) => tally[key] + (key === "bytes" ? bytes : 0) > bounds[key]);
    const spent = {} as ReadsSpent;
    PAST.set(spent, (bytes) => {
      if (over(document, limits, bytes)) return limits;
      return over(session, budget, bytes) ? budget : total;
    });
    for (const key of SPENT_KEYS) {
      Object.defineProperty(spent, key, {
        get: () =>
          Math.max(
            document[key],
            limits[key] - budget[key] + session[key],
            limits[key] - total[key] + allSpent[key],
          ),
        set: (value: number) => {
          const taken = value - spent[key];
          const within = Math.max(0, Math.min(most[key], document[key] + taken) - document[key]);
          const reread = Math.min(within, free[key]);
          free[key] -= reread;
          document[key] += taken;
          most[key] = Math.max(most[key], document[key]);
          session[key] += taken - reread;
          allSpent[key] += taken - reread;
        },
      });
    }
    return limitedFetch(fetch, limits, spent)(input, init);
  };
}

/** The limits a response is read under: limitedFetch's, or none. */
export function limitsOf(response: Response): ReadLimits | undefined {
  return READS.get(response)?.limits;
}

/** What is spent of the limits a response is read under (limitedFetch), its read's own or shared with others; none with no limits. */
export function spentOf(response: Response): ReadsSpent | undefined {
  return READS.get(response)?.spent;
}

/** Why the body of a response limitedFetch gave failed to be read: past its limit; undefined when it was not, or there was no response. */
export function refusalOf(response: Response | undefined): ReadLimitError | undefined {
  return response === undefined ? undefined : READS.get(response)?.refused;
}

/**
 * The most characters a term may have, by the longest name a library
 * the app reads data with keys it by (termKeyLength), in any document
 * the app reads, under limits or with none, and in any it writes
 * (writableTerms.ts). V8 hashes a string longer than this by its length
 * alone, so a Map, Set or object keyed by many such strings of one
 * length finds a key only by comparing it with every other, in time that
 * grows with the square of their number. The app, and the libraries it
 * reads data with, key their maps by terms, each by one of those names:
 * one held to the bound in every name keys them in time linear in their
 * number. A key of several terms is a path of them (pathKeys, PathMap
 * in the domain's pathKeys.ts), never one string. One library does join
 * terms: the shape engine (rdf-validate-shacl) counts the checks of a
 * node against a shape by the JSON of the two, so the shacl package's
 * engine.ts counts them itself, by a path of the two terms, and turns
 * the library's count off. The longest text in the library (decks/) is
 * about a third of the bound.
 *
 * The bound does not cover a key that joins a term with its graph, as
 * @rdfjs/dataset keys a quad: the same triple in many graphs named by
 * long IRIs of one length would be slow again. No read keeps a graph
 * today (a pod is read as Turtle, a deck file keeps its default graph);
 * one that does, such as TriG or JSON-LD read from a pod, needs its
 * graphs bounded as well.
 */
export const MAX_TERM_CHARACTERS = HASHED_CHARACTERS;

const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";
const RDF_LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";

const QUOTE = 0x22;
const NEWLINE = 0x0a;
const RETURN = 0x0d;
const ESCAPE = 0x5c;

/** How many characters of a literal's text N-Triples escapes, each one written as two. */
function escapedCharacters(value: string): number {
  let count = 0;
  for (let at = 0; at < value.length; at++) {
    const code = value.charCodeAt(at);
    if (code === QUOTE || code === ESCAPE || code === NEWLINE || code === RETURN) count++;
  }
  return count;
}

/**
 * How many characters a term has by the longest name a library the app
 * reads data with keys it by. One is its id (n3, @rdfjs/dataset): an
 * IRI as it is, a blank node with `_:` before its label, a literal in
 * quotes with its language (and direction) or a datatype other than
 * xsd:string after it. The other is its N-Triples form (@rdfjs/to-ntriples,
 * which the shape check's sets of terms key by): an IRI in `<>`, a
 * literal with `"`, `\`, a line feed and a carriage return escaped,
 * each as two characters, and a datatype in `<>` too.
 */
export function termKeyLength(term: Term): number {
  if (term.termType !== "Literal") return term.value.length + TERM_NAME_ROOM;
  const { value, language, direction, datatype } = term;
  const tagged = language.length + 1 + (direction ? direction.length + 2 : 0);
  const typed = datatype.value === XSD_STRING ? 0 : datatype.value.length + 4;
  const named = language !== "" ? tagged : typed;
  const written = datatype.value === RDF_LANG_STRING ? language.length + 1 : typed;
  return value.length + 2 + Math.max(named, escapedCharacters(value) + written);
}

/**
 * How many characters more a blank node's label may have as it is read
 * back than as it is written: a parser names the labels it reads anew,
 * n3 with a prefix of its own (`b0_`) before each.
 */
const BLANK_LABEL_ROOM = 32;

/**
 * Whether a term is longer than MAX_TERM_CHARACTERS (termKeyLength) as
 * it would be read back: a blank node with BLANK_LABEL_ROOM for the
 * prefix a parser puts before its label. A write (writableTerms.ts)
 * refuses such a term, and so does a read that keeps its labels to
 * write them back as they are (BlankLabels), so whatever a read keeps
 * can be written back whole.
 */
export function isTermTooLong(term: Term): boolean {
  const room = term.termType === "BlankNode" ? BLANK_LABEL_ROOM : 0;
  return termKeyLength(term) + room > MAX_TERM_CHARACTERS;
}

/**
 * How many reads have named their blank nodes (blankNodeNamer), so that
 * no two in one page (or one process) name one alike. Nothing relies on
 * it across clients: a label means nothing outside its document.
 */
let namingReads = 0;

/**
 * The blank nodes of one Turtle read, named anew: each label the parser gave
 * one gets a short label of its own, the same for each mention of it. The
 * labels are unique within one page (or one process) only, as they come
 * from a counter of that page (namingReads): no two reads there name a
 * blank node alike. A parser puts a prefix of its own before each label
 * it reads (n3, `b0_`), so a label kept as read and written
 * back would come back longer with each save of its document, to past
 * the bound on a term (isTermTooLong): the read would refuse a document
 * the app had written itself. A label means nothing outside its
 * document. A quad is named once quadTally has held its labels to the
 * bound, so no label past it keys the names. A JSON-LD read keeps its
 * labels, held to the bound as a write holds them (BlankLabels), and a
 * write holds them to Turtle's grammar too (writableTerms.ts).
 */
export function blankNodeNamer(factory: DataFactory): (quad: Quad) => Quad {
  const prefix = `r${namingReads++}_`;
  const names = new Map<string, BlankNode>();
  const named = <T extends Term>(term: T): T => {
    if (term.termType !== "BlankNode") return term;
    let name = names.get(term.value);
    if (name === undefined) {
      name = factory.blankNode(`${prefix}${names.size}`);
      names.set(term.value, name);
    }
    return name as T;
  };
  return (quad) =>
    [quad.subject, quad.object, quad.graph].some((term) => term.termType === "BlankNode")
      ? factory.quad(named(quad.subject), quad.predicate, named(quad.object), named(quad.graph))
      : quad;
}

/**
 * What a read does with the labels of its blank nodes. A Turtle read
 * names them anew (blankNodeNamer), so a label is held to the bound as
 * the parser gave it, its prefix included, and what is written back is
 * the short name. A JSON-LD read keeps them, and writes them back as
 * they are, so a label is held to the bound as a write holds it, with
 * room for the prefix a later Turtle read puts before it (isTermTooLong).
 * Either way, whatever a read keeps can be written back and read again.
 */
export type BlankLabels = "renamed" | "kept";

/** Whether a term of a quad is past the bound, its blank nodes measured as `labels` says. */
function termPast({ subject, predicate, object, graph }: Quad, labels: BlankLabels): boolean {
  const past =
    labels === "kept" ? isTermTooLong : (term: Term) => termKeyLength(term) > MAX_TERM_CHARACTERS;
  return [subject, predicate, object, graph].some(past);
}

/**
 * Whether a parsed quad names an IRI under `prefix` as its subject,
 * predicate, object or graph. A client keeps such a prefix for the
 * subjects it makes by name, whose IRI says they aren't saved yet, so
 * no document can state one: a read tallies the quad (quadTally), then
 * leaves it out.
 */
export function namesIriUnder(
  { subject, predicate, object, graph }: Quad,
  prefix: string,
): boolean {
  return [subject, predicate, object, graph].some(
    (term) => term.termType === "NamedNode" && term.value.startsWith(prefix),
  );
}

/**
 * A tally of the triples parsed under `limits`, and of the characters of
 * their terms (subject, predicate, object with its datatype and
 * language, graph): a prefix lets a short line of Turtle, or a context
 * a short line of JSON-LD, stand for terms as long as it is, so a
 * document's bytes do not bound what its triples hold. Each call counts
 * one triple, into `spent` (by default the parse's own), and its subject,
 * in this parse, where the limits bound subjects, and says whether a
 * count is now past its limit, or the triple has a term longer than
 * MAX_TERM_CHARACTERS, its blank nodes measured as the read keeps them
 * (BlankLabels): that, with no limits too. The set of subjects
 * holds one past its limit at most, as a read stops there.
 */
export function quadTally(
  limits: ReadLimits | undefined,
  labels: BlankLabels,
  spent: ReadsSpent = noneSpent(),
): (quad: Quad) => boolean {
  const subjects = new Set<string>();
  return (quad) => {
    if (termPast(quad, labels)) return true;
    if (limits === undefined) return false;
    const { subject, predicate, object, graph } = quad;
    spent.quads++;
    spent.characters += length(subject) + length(predicate) + length(object) + length(graph);
    if (limits.subjects !== undefined) subjects.add(`${subject.termType} ${subject.value}`);
    return (
      spent.quads > limits.quads ||
      spent.characters > limits.characters ||
      subjects.size > (limits.subjects ?? Number.POSITIVE_INFINITY)
    );
  };
}

/**
 * The most base declarations (`@base`, `BASE`) a Turtle text may make,
 * read under limits or with none. The parser resolves each against the one before it,
 * walking the whole base each time, and a declaration makes no triple
 * for quadTally to count. A document needs one at most; each release in
 * the library has one.
 */
const MAX_BASE_DECLARATIONS = 16;

/**
 * The most prefix declarations (`@prefix`, `PREFIX`) a Turtle text may
 * make, read under limits or with none. The parser resolves the IRI of each against
 * the base, walking the whole base, and a declaration makes no triple
 * for quadTally to count. A document needs a few; the bound leaves a
 * wide margin over that.
 */
const MAX_PREFIX_DECLARATIONS = 4096;

/**
 * The most characters the base of a Turtle text may reach, read under
 * limits or with none. The parser walks the whole base for each relative IRI it
 * resolves, and a triple's terms can be far shorter than the base (an
 * IRI that goes up a level), so the read limits on the triples bound
 * the time only with the base bounded too. A release names itself as
 * its base, so this is about the longest address it can have.
 */
export const MAX_BASE_CHARACTERS = 512;

/**
 * How deep a Turtle text may nest its collections (`(`), blank nodes
 * (`[`), annotations (`{|`) and triple terms (`<<`), read under limits
 * or with none. The parser keeps a context for each level it is in, and
 * makes the triple that links a level to the one above it only once the
 * level ends, so a text that only opens levels makes no triple for
 * quadTally to count, and holds memory in the measure of its length.
 * The app's own documents, and every release in the library, nest a few
 * levels; the bound leaves a wide margin over that.
 */
const MAX_TURTLE_DEPTH = 64;

const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;
const HASH = 0x23;
const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const AT_SIGN = 0x40;
const BACKSLASH = 0x5c;

/** An IRI with a scheme, which a base resolves to on its own, as the Turtle parser tells one. */
const ABSOLUTE_IRI = /^[a-z][a-z0-9+.-]*:/i;

/** A `.` or `..` segment of a path. */
const DOT_SEGMENT = /(?:^|\/)\.\.?(?:$|\/)/;

/** A `.` or `..` segment anywhere in an IRI, as the parser finds one: before a query or fragment too. */
const ANY_DOT_SEGMENT = /(?:^|\/)\.\.?(?:$|[/?#])/;

/**
 * Where the search of a Turtle text stops to look: a string, an IRI, an
 * escape, a comment, a bracket, or what may start a directive.
 */
const NEXT = /["'<>\\#@bBpP()[\]{}]/g;

/** How each bracket of one character, by its code, changes how deep a Turtle text nests: one that opens a level, or one that closes it. */
const NESTING = new Map([
  [0x28, 1], // (
  [0x5b, 1], // [
  [0x7b, 1], // {
  [0x29, -1], // )
  [0x5d, -1], // ]
  [0x7d, -1], // }
]);

/** How the bracket of two characters at `at` changes how deep a Turtle text nests: `<<` opens a level, `>>` closes one, and 0 where there is none. */
function doubleBracketAt(text: string, at: number): number {
  const code = text.charCodeAt(at);
  if ((code !== LESS_THAN && code !== GREATER_THAN) || text.charCodeAt(at + 1) !== code) return 0;
  return code === LESS_THAN ? 1 : -1;
}

/**
 * Where an IRI the parser reads stops: at its `>`, or at what no IRI
 * holds as it is written, where there is none. The parser refuses an
 * IRI with any other character an IRI can't hold, once it has read it.
 */
const IRI_STOP = /[ <>{}]|\\(?![uU])/g;

/** A directive with an at sign, as the parser reads one: a longer word is none. */
const AT_DIRECTIVE = /@(base|prefix)(?![a-z])/iy;

/** A directive in SPARQL's form, as the parser reads one, in any case. */
const DIRECTIVE = /(base|prefix)(?=[\s#<"'])/iy;

/** What a name goes on with: a directive in SPARQL's form starts no later than the name does. */
const IN_NAME = /[\w:-]/;

/**
 * Whether a declared base, the IRI as written, has a plain path: no
 * empty segment, no escape that could stand for a segment, and no `.`
 * or `..` segment but in a relative path with no colon. The parser
 * keeps an absolute base as it is written, and walks such segments of
 * it again for every IRI it resolves against it; no release the app
 * writes has one. A relative path it resolves against the base before,
 * which removes its dot segments, as a document written by hand may
 * have them (`@base <./>`). One that starts at the root it resolves on
 * its own, and there it takes a colon for the end of a scheme and
 * keeps the segment after it.
 */
export function plainBase(iri: string): boolean {
  if (iri.includes("\\")) return false;
  const scheme = ABSOLUTE_IRI.exec(iri)?.[0].length ?? 0;
  let path = iri.slice(scheme);
  if (scheme > 0 && path.startsWith("//")) {
    const authority = path.slice(2).search(/[/?#]/);
    path = authority < 0 ? "" : path.slice(2 + authority);
  }
  const query = path.search(/[?#]/);
  if (query >= 0) path = path.slice(0, query);
  const resolved = scheme === 0 && !path.startsWith("/") && !path.includes(":");
  return !path.includes("//") && (resolved || !DOT_SEGMENT.test(path));
}

/**
 * Whether an IRI as written, longer than MAX_BASE_CHARACTERS, is past
 * what any read takes in: one the parser resolves, which is relative, or
 * may hold a dot segment (one, or an escape that could stand for one).
 * The parser removes the dot segments of an IRI it resolves in time that
 * grows with the square of its length, before it makes a triple for
 * quadTally to count. It keeps an absolute IRI as it is written, so a
 * long one with no dot segment is bounded only by the read limits.
 */
function longIriPast(iri: string): boolean {
  return (
    iri.length > MAX_BASE_CHARACTERS &&
    (!ABSOLUTE_IRI.test(iri) || iri.includes("\\") || ANY_DOT_SEGMENT.test(iri))
  );
}

/** Where the IRI that starts at `at` (its `<`) of a Turtle text ends, as the parser reads it: -1 when none does. */
function iriEnd(text: string, at: number): number {
  IRI_STOP.lastIndex = at + 1;
  const stop = IRI_STOP.exec(text)?.index ?? -1;
  return text.charCodeAt(stop) === GREATER_THAN ? stop + 1 : -1;
}

/**
 * Where the string that starts at `at` of a Turtle text ends, as the
 * parser ends it: at the first of its quotes (three of them for a long
 * string) that no escape takes, or at the end of the text. A string the
 * parser refuses, such as a short one over two lines, ends the parse
 * there, so what the search makes of the rest is the same.
 */
function stringEnd(text: string, at: number): number {
  const quote = text[at]!;
  const closing = text.startsWith(quote.repeat(3), at) ? quote.repeat(3) : quote;
  let from = at + closing.length;
  for (;;) {
    const found = text.indexOf(closing, from);
    if (found < 0) return text.length;
    let escapes = 0;
    while (text.charCodeAt(found - escapes - 1) === BACKSLASH) escapes++;
    if (escapes % 2 === 0) return found + closing.length;
    from = found + 1;
  }
}

/**
 * Whether the base and prefix declarations and the IRIs of a Turtle
 * text read as `url`, those that start before an offset of the text,
 * are past what any read takes in, under limits or with none: more than
 * MAX_BASE_DECLARATIONS bases, more than MAX_PREFIX_DECLARATIONS
 * prefixes, a base whose path is not plain (plainBase), a base of more
 * than MAX_BASE_CHARACTERS, or an IRI longer than that which is
 * relative or may hold a dot segment (longIriPast), in a triple or a
 * declaration, or nesting deeper than MAX_TURTLE_DEPTH. A document
 * needs one base, a few prefixes, short relative IRIs and a few levels,
 * and the parser takes time in the square of a chain of relative bases,
 * and of an IRI with dot segments, and holds memory for every level it
 * is in, wherever the text is read from. Each call looks on from where the last stopped, so a text
 * is looked through once, as far as it is written (writeTurtle), in
 * time linear in it.
 *
 * The search reads the text as the parser does: past strings (with
 * their escapes), IRIs and comments, where a declaration is only text,
 * a directive (`@base`, `@prefix`, or `BASE`, `PREFIX` in any case) is
 * one where the parser could start one, and a base's IRI the first after
 * it, past white space and comments: a `<` there with no IRI of at most
 * MAX_BASE_CHARACTERS from it is past the limits. Where the two could
 * differ, the search errs toward a refusal, or the parser stops at an
 * error before it. The longest base the parser can reach is then the
 * longest of the URL and the absolute IRIs, with every relative IRI
 * added on. A level opens at `(`, `[`, `{` and `<<`, and closes at `)`,
 * `]`, `}` and `>>`; one closed that was never opened counts for none,
 * so the depth found is never less than the parser's.
 */
function declarationsPast(text: string, url: string): (end: number) => boolean {
  const lineEnd = /[\n\r]/g;
  let bases = 0;
  let prefixes = 0;
  let longest = url.length;
  let added = 0;

  /** Where the parser reads the next token from `from` on, past white space and comments. */
  const pastSeparators = (from: number): number => {
    let at = from;
    for (;;) {
      const code = text.charCodeAt(at);
      if (code === SPACE || code === TAB || code === LF || code === CR) at++;
      else if (code === HASH) {
        lineEnd.lastIndex = at;
        at = lineEnd.exec(text)?.index ?? text.length;
      } else return at;
    }
  };

  /** Whether the directive `word`, which ends at `from`, declares one past the limits. */
  const declarationPast = (word: string, from: number): boolean => {
    if (word.length !== 4) return ++prefixes > MAX_PREFIX_DECLARATIONS;
    const at = pastSeparators(from);
    // With no IRI next, the parser stops at an error.
    if (text.charCodeAt(at) !== LESS_THAN) return false;
    if (++bases > MAX_BASE_DECLARATIONS) return true;
    // An IRI no longer than a base may be, or one the parser stops at.
    const end = iriEnd(text.slice(at, at + MAX_BASE_CHARACTERS + 2), 0);
    if (end < 0) return true;
    const iri = text.slice(at + 1, at + end - 1);
    if (!plainBase(iri)) return true;
    if (ABSOLUTE_IRI.test(iri)) longest = Math.max(longest, iri.length);
    else added += iri.length;
    return longest + added > MAX_BASE_CHARACTERS;
  };

  // The document's own address is its first base: a Turtle text at a longer one is refused, with limits or with none.
  let refused = url.length > MAX_BASE_CHARACTERS;

  let depth = 0;
  /** Where the search goes on, at `next`, a level opened (1) or closed (-1) before it. */
  const nest = (step: number, next: number): number => {
    depth = Math.max(0, depth + step);
    refused = depth > MAX_TURTLE_DEPTH;
    return next;
  };

  /** Where the search goes on after what starts at `at`, having checked a directive there. */
  const lookAt = (at: number): number => {
    const code = text.charCodeAt(at);
    if (code === HASH) {
      lineEnd.lastIndex = at;
      return lineEnd.exec(text)?.index ?? text.length;
    }
    if (code === BACKSLASH) return at + 2;
    const single = NESTING.get(code);
    if (single !== undefined) return nest(single, at + 1);
    const double = doubleBracketAt(text, at);
    if (double !== 0) return nest(double, at + 2);
    if (code === LESS_THAN) {
      const end = iriEnd(text, at);
      if (end < 0) return at + 1;
      refused = longIriPast(text.slice(at + 1, end - 1));
      return end;
    }
    if (text[at] === '"' || text[at] === "'") return stringEnd(text, at);
    const directive =
      code === AT_SIGN ? AT_DIRECTIVE : IN_NAME.test(text[at - 1] ?? "") ? undefined : DIRECTIVE;
    if (directive === undefined) return at + 1;
    directive.lastIndex = at;
    const word = directive.exec(text)?.[1];
    if (word === undefined) return at + 1;
    refused = declarationPast(word, directive.lastIndex);
    return directive.lastIndex;
  };

  // Where the search goes on from: past all it looked at.
  let searched = 0;
  return (end) => {
    while (!refused && searched < end) {
      NEXT.lastIndex = searched;
      const next = NEXT.exec(text)?.index ?? text.length;
      searched = next < end ? lookAt(next) : next;
    }
    return refused;
  };
}

/** A stream as the Turtle parser reads one: it listens for its parts (`data`) and its `end`. */
export interface TextStream {
  on(event: string, listener: (part?: string) => void): void;
}

/**
 * Parse a Turtle text read as `url`, by a parser that
 * reads streams: `parse` hands it the text as one (n3's parser reads
 * such an object, as its own stream parser hands it one), and the text
 * is written to it in parts (textChunks), then ended, while `goOn` says
 * to. A parser given the whole text goes on through all of it after the
 * tally is past its limits; here it reads no further than the part it
 * is in. Before each part, the base and prefix declarations, the IRIs
 * and the levels that start in it, or before, are checked
 * (declarationsPast), with limits or with none: false when they are
 * past what a read takes in, and the rest is not written; true
 * otherwise.
 */
export function writeTurtle(
  text: string,
  url: string,
  parse: (stream: TextStream) => void,
  goOn: () => boolean,
): boolean {
  const listeners = new Map<string, (part?: string) => void>();
  parse({ on: (event, listener) => void listeners.set(event, listener) });
  const past = declarationsPast(text, url);
  let end = 0;
  for (const part of textChunks(text)) {
    end += part.length;
    if (past(end)) return false;
    if (!goOn()) return true;
    listeners.get("data")?.(part);
  }
  if (!goOn()) return true;
  // The parser ends only a text it was given some of: an empty one is a blank one to it.
  if (end === 0) listeners.get("data")?.(" ");
  listeners.get("end")?.();
  return true;
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
export function* textChunks(text: string): Generator<string> {
  for (let start = 0; start < text.length; ) {
    let end = start + TEXT_CHUNK;
    const last = text.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end++;
    yield text.slice(start, end);
    start = end;
  }
}
