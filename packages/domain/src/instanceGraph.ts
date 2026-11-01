// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { SITE } from "@solid-memo/vocab/ns";
import { ensureTrailingSlash, isDocumentIn } from "./instanceLayout";
import { KNOWN_LICENSES } from "./license";
import { DCTERMS_NS, type ReleaseText, SCHEMA_NS } from "./release/releaseModel";
import { RDF_TYPE, type DraftTriple } from "./release/releaseDraft";
import { documentUrlOf } from "./subjectUrl";

/**
 * An instance's Solid Memo data as a graph, for the Studio to draw:
 * every resource its documents define is a node, and every link between
 * them an edge. Built from the documents read alone (what the
 * application read, InstanceGraphReader): where a document or subject
 * sits is worked out from its URL and from the document that defines it,
 * with no request of its own. An IRI the documents name that is not the
 * instance's data is a leaf, never read: the catalog and every link are
 * data anyone may have written, and what they point to is not ours to
 * fetch. Pure, and linear in the triples read.
 */

/**
 * A document of the instance as read: its triples, none when there was
 * none (`found` false, a 404) or it could not be read (`found` false and
 * `unreadable`: refused, or not Turtle).
 */
export interface GraphDocument {
  url: string;
  found: boolean;
  unreadable?: true;
  triples: readonly DraftTriple[];
}

/** What a graph is built from: the instance, the user's storages and the documents read. */
export interface InstanceGraphInput {
  instanceUrl: string;
  storages: readonly string[];
  documents: readonly GraphDocument[];
}

/**
 * What a node is:
 *
 * - `container`: the instance's folder, or a folder in it a document read is in;
 * - `document`: a document read, `found` false when there was none;
 * - `resource`: a subject a document of the instance defines;
 * - `missing`: an IRI in the instance a link names that no document read
 *   defines (an answer naming a card since removed, say);
 * - `podLeaf`: an IRI in one of the user's storages that is not the
 *   instance's data (the WebID profile on many servers, a release
 *   published elsewhere);
 * - `vocabularyLeaf`: a class, concept, license, theme or media type, one
 *   node however many name it;
 * - `outsideLeaf`: any other IRI, outside the user's pod (a library
 *   release, an image, a `mailto:` address).
 */
export type GraphNodeKind =
  | "container"
  | "document"
  | "resource"
  | "missing"
  | "podLeaf"
  | "outsideLeaf"
  | "vocabularyLeaf";

/** A literal a document states of a node, and which document states it. */
export interface GraphLiteral {
  predicate: string;
  value: string;
  /** Its language tag, when it has one. */
  language?: string;
  /** Its datatype, unless plain text (xsd:string, rdf:langString). */
  datatype?: string;
  document: string;
}

export interface GraphNode {
  /** The IRI; for a blank node, `_:<label>@<document>`, its label being its document's own. */
  id: string;
  kind: GraphNodeKind;
  /** The document that defines it: a resource's, or a document's own URL; none for a container or a leaf. */
  document?: string;
  /** For a document: whether there was one. */
  found?: boolean;
  /** For a document not found: it could not be read, rather than not being there. */
  unreadable?: true;
  /** Whether it is a blank node. */
  blank?: true;
  /** Its classes (rdf:type), as the documents read state them. */
  types: string[];
  /** The literals the documents read state of it, a leaf's too. */
  literals: GraphLiteral[];
}

/**
 * How two nodes are joined: `link`, a statement of a document whose
 * object is a node; `vocabulary`, one whose object is a vocabulary leaf;
 * `containment`, a folder holding a folder or document (`predicate`
 * ldp:contains) or a document defining a subject (`predicate` "", no
 * statement saying so).
 */
export type GraphEdgeKind = "link" | "containment" | "vocabulary";

export interface GraphEdge {
  from: string;
  to: string;
  predicate: string;
  kind: GraphEdgeKind;
}

export interface InstanceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";

const PLAIN_TEXT = new Set([
  "http://www.w3.org/2001/XMLSchema#string",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString",
]);

/** Where the terms the documents use are defined: Solid Memo's own, and the vocabularies it uses. */
const VOCABULARIES = [
  `${SITE}ns/`,
  // The W3C's vocabularies, not every page of its site (a person's WebID there, say).
  "http://www.w3.org/ns/",
  "https://www.w3.org/ns/",
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://www.w3.org/2000/01/rdf-schema#",
  "http://www.w3.org/2001/XMLSchema#",
  "http://www.w3.org/2002/07/owl#",
  "http://www.w3.org/2004/02/skos/core#",
  "http://www.w3.org/2006/vcard/ns#",
  "http://purl.org/dc/",
  SCHEMA_NS,
  "http://schema.org/",
  "http://xmlns.com/foaf/",
  "http://publications.europa.eu/resource/authority/",
  "https://www.iana.org/assignments/media-types/",
];
const LICENSES = new Set(KNOWN_LICENSES);
const LICENSE = `${DCTERMS_NS}license`;
const LICENSE_DOCUMENT = `${DCTERMS_NS}LicenseDocument`;

/** The id of a term a document states: a blank node's is scoped to the document. */
function idOf(term: string, document: string): string {
  return term.startsWith("_:") ? `${term}@${document}` : term;
}

/** Each subject's defining document, worked out from every statement read (see homeOf). */
function homesOf(documents: readonly GraphDocument[], root: string): Map<string, string> {
  const own = new Set<string>();
  const first = new Map<string, string>();
  const state = (term: string, url: string) => {
    const id = idOf(term, url);
    if (term.startsWith("_:") || documentUrlOf(term) === url) own.add(id);
    if (!first.has(id)) first.set(id, url);
  };
  for (const { url, triples } of documents) {
    for (const { subject, object } of triples) {
      state(subject, url);
      // A blank node is its document's, though nothing is said of it.
      if (object.kind === "blank") state(`_:${object.value}`, url);
    }
  }
  const homes = new Map<string, string>();
  for (const [id, url] of first) {
    // A subject is its own document's, if that states it; one in the instance whose document does not, the first document's that does.
    if (own.has(id)) homes.set(id, id.startsWith("_:") ? url : documentUrlOf(id));
    else if (id.startsWith(root)) homes.set(id, url);
  }
  return homes;
}

/** The terms the documents state as such: the classes (rdf:type) and the licenses (dcterms:license, dcterms:LicenseDocument). */
function termsOf(documents: readonly GraphDocument[]): Set<string> {
  const terms = new Set<string>();
  for (const { triples } of documents) {
    for (const { subject, predicate, object } of triples) {
      if (object.kind !== "iri") continue;
      if (predicate === RDF_TYPE || predicate === LICENSE) terms.add(object.value);
      if (predicate === RDF_TYPE && object.value === LICENSE_DOCUMENT) terms.add(subject);
    }
  }
  return terms;
}

/** The kind of node an IRI no document read defines is. */
function leafKind(
  iri: string,
  root: string,
  storages: readonly string[],
  terms: ReadonlySet<string>,
): GraphNodeKind {
  if (iri.startsWith(root)) return "missing";
  if (storages.some((storage) => iri.startsWith(storage))) return "podLeaf";
  if (
    terms.has(iri) ||
    LICENSES.has(iri) ||
    VOCABULARIES.some((namespace) => iri.startsWith(namespace))
  )
    return "vocabularyLeaf";
  return "outsideLeaf";
}

/** A literal a document states, its language and datatype only when it has them. */
function literalOf(predicate: string, object: ReleaseText, document: string): GraphLiteral {
  return {
    predicate,
    value: object.value,
    ...(object.language === "" ? {} : { language: object.language }),
    ...(PLAIN_TEXT.has(object.datatype) ? {} : { datatype: object.datatype }),
    document,
  };
}

/**
 * How long and how deep a document's path in the instance may be for it
 * to be drawn: far past any address Solid Memo makes. Each folder on the
 * way is a node named by its whole address, so a longer or deeper one,
 * which only a catalog someone else wrote can name, would cost the graph
 * and every step over it time and memory growing with the square of its
 * length.
 */
const DRAWN_PATH = { length: 2_048, parts: 32 };

/**
 * Whether the graph draws the document `url` of the instance at `root`:
 * a document in it (isDocumentIn), its path in it no longer or deeper
 * than DRAWN_PATH allows.
 */
export function isDrawnDocument(url: string, root: string): boolean {
  const path = url.slice(ensureTrailingSlash(root).length);
  return (
    path.length <= DRAWN_PATH.length &&
    path.split("/").length <= DRAWN_PATH.parts &&
    isDocumentIn(url, root)
  );
}

/** The graph of an instance's documents as read: see InstanceGraph. */
export function instanceGraphOf({
  instanceUrl,
  storages,
  documents: read,
}: InstanceGraphInput): InstanceGraph {
  const root = ensureTrailingSlash(instanceUrl);
  // A storage named without its trailing slash holds no address that merely starts as it does.
  const pods = storages.map(ensureTrailingSlash);
  // A document elsewhere is not the instance's data, whatever the catalog says.
  const documents = read.filter(({ url }) => isDrawnDocument(url, root));
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const edge = (from: string, to: string, predicate: string, kind: GraphEdgeKind): boolean => {
    const key = `${from} ${predicate} ${to}`;
    if (edges.has(key)) return false;
    edges.set(key, { from, to, predicate, kind });
    return true;
  };
  const add = (node: Omit<GraphNode, "types" | "literals">): GraphNode => {
    const made: GraphNode = { ...node, types: [], literals: [] };
    nodes.set(node.id, made);
    return made;
  };

  add({ id: root, kind: "container" });
  for (const { url, found, unreadable } of documents) {
    let parent = root;
    for (const segment of url.slice(root.length).split("/").slice(0, -1)) {
      const container = `${parent}${segment}/`;
      if (!nodes.has(container)) add({ id: container, kind: "container" });
      edge(parent, container, LDP_CONTAINS, "containment");
      parent = container;
    }
    add({ id: url, kind: "document", document: url, found, ...(unreadable ? { unreadable } : {}) });
    edge(parent, url, LDP_CONTAINS, "containment");
  }

  const homes = homesOf(documents, root);
  for (const [id, document] of homes) {
    if (nodes.has(id)) continue;
    add({ id, kind: "resource", document, ...(id.startsWith("_:") ? { blank: true } : {}) });
    edge(document, id, "", "containment");
  }

  const terms = termsOf(documents);
  const nodeOf = (id: string): GraphNode =>
    nodes.get(id) ?? add({ id, kind: leafKind(id, root, pods, terms) });

  for (const { url, triples } of documents) {
    for (const { subject, predicate, object } of triples) {
      const from = nodeOf(idOf(subject, url));
      if (object.kind === "literal") {
        from.literals.push(literalOf(predicate, object, url));
        continue;
      }
      const to = nodeOf(idOf(object.kind === "blank" ? `_:${object.value}` : object.value, url));
      const kind = to.kind === "vocabularyLeaf" ? "vocabulary" : "link";
      const made = edge(from.id, to.id, predicate, kind);
      if (made && predicate === RDF_TYPE && object.kind === "iri") from.types.push(to.id);
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
