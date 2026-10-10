import type { AgentV1 } from "@solid-memo/vocab/types.generated";
import { takenIds } from "./courseIds.ts";
import { slugOf } from "./draftLayout.ts";
import { RDFS_COMMENT } from "./provenanceRules.ts";
import {
  activitiesOf,
  applyDraftChanges,
  attributionOf,
  authorNames,
  generatingActivities,
  idIn,
  iriIn,
  isRefusal,
  PROV,
  readCheckActivity,
  type CheckActivity,
  type DraftChange,
  type DraftNode,
  type DraftTriple,
  type ReleaseDraft,
} from "./releaseDraft.ts";
import { DCTERMS_NS, type ReleaseTerm, type ReleaseText } from "./releaseModel.ts";

/**
 * The release screen's view of a draft (docs/studio.md, The release's
 * metadata and provenance): its authors, its sources and the checks it
 * had, read from the draft, and the changes (releaseDraft.ts) that edit
 * them. Nothing here records that anyone reviewed the release: a check
 * is a machine's or an AI's, and the attribution says who compiled it.
 */

const DCTERMS_TITLE = `${DCTERMS_NS}title`;
const DCTERMS_CREATOR = `${DCTERMS_NS}creator`;
const DCTERMS_LICENSE = `${DCTERMS_NS}license`;
const XSD_STRING = "http://www.w3.org/2001/XMLSchema#string";

// --- Authors

/** The release's authors that are agents of the draft (dcterms:creator), in order. */
export function authorsOf(draft: ReleaseDraft): DraftNode<AgentV1>[] {
  return draft.root.creator.flatMap((iri) => {
    const id = idIn(draft, iri);
    return draft.agents.filter((node) => node.id === id);
  });
}

/** The authors the release names that are not agents of the draft (another document's), by IRI: kept as they are. */
export function otherAuthorsOf(draft: ReleaseDraft): string[] {
  const own = new Set(authorsOf(draft).map((node) => iriIn(draft, node.id)));
  return draft.root.creator.filter((iri) => !own.has(iri));
}

/** A new agent's id, from its name (`anton-wiklund`), then `-2`, `-3`… until it is free; "author" when nothing of the name is left. */
export function agentIdFor(draft: ReleaseDraft, name: string): string {
  const taken = takenIds(draft);
  const base = slugOf(name) || "author";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * The changes, between the attribution taken out while it still names
 * the authors as they are and written again for the authors they leave
 * (when the release states one): none when they leave none.
 */
function withAttribution(draft: ReleaseDraft, changes: DraftChange[]): DraftChange[] {
  const attribution = attributionOf(draft);
  if (attribution === null) return changes;
  const after = applyDraftChanges(draft, changes);
  const left = isRefusal(after) ? authorNames(draft) : authorNames(after);
  return [
    { kind: "setAttribution", attribution: null },
    ...changes,
    ...(left.length === 0 ? [] : [{ kind: "setAttribution" as const, attribution: { ai: attribution.ai } }]),
  ];
}

/** A new author: an agent of the draft (by `id`), named among its authors last. */
export function addAuthorChanges(draft: ReleaseDraft, id: string, agent: AgentV1): DraftChange[] {
  return withAttribution(draft, [
    { kind: "setAgent", id, agent },
    { kind: "setMeta", meta: { creator: [...draft.root.creator, iriIn(draft, id)] } },
  ]);
}

/** An author's name and email, changed. */
export function editAuthorChanges(draft: ReleaseDraft, id: string, agent: AgentV1): DraftChange[] {
  return withAttribution(draft, [{ kind: "setAgent", id, agent }]);
}

/**
 * An author no longer named among the authors. Its agent goes too, unless
 * it publishes the release or a statement names it (an activity carried
 * from an earlier release may: that is never rewritten).
 */
export function removeAuthorChanges(draft: ReleaseDraft, id: string): DraftChange[] {
  const iri = iriIn(draft, id);
  const named = draft.root.publisher === iri || draft.triples.some((triple) => triple.object.kind === "iri" && triple.object.value === iri);
  return withAttribution(draft, [
    { kind: "setMeta", meta: { creator: draft.root.creator.filter((one) => one !== iri) } },
    ...(named ? [] : [{ kind: "setAgent" as const, id, agent: null }]),
  ]);
}

// --- Sources

/** A source of the release as its screen edits it. */
export interface SourceView {
  iri: string;
  /** Its title (dcterms:title), "" for none. */
  title: string;
  /** Who made it (dcterms:creator, as text), "" for none. */
  creator: string;
  /** Its licence (dcterms:license), "" for none. */
  license: string;
  /** The evidence for its licence, quoted or described (rdfs:comment), "" for none. */
  evidence: string;
  /** The release is drawn from it (prov:wasDerivedFrom). */
  derivedFrom: boolean;
  /** This version's making used it (prov:used). */
  used: boolean;
  /** How an earlier version was made used it: that is kept as it is. */
  usedEarlier: boolean;
  /** Its other statements, kept as they are. */
  others: readonly { predicate: string; object: ReleaseTerm }[];
}

/** What a source's form gives: its texts, and how the release uses it. */
export type SourceForm = Pick<SourceView, "title" | "creator" | "license" | "evidence" | "derivedFrom" | "used">;

/** The IRIs the activities used (prov:used). */
function usedBy(draft: ReleaseDraft, activities: readonly string[]): string[] {
  return draft.triples
    .filter((triple) => triple.predicate === `${PROV}used` && activities.includes(triple.subject) && triple.object.kind === "iri")
    .map((triple) => triple.object.value);
}

/**
 * The release's sources: those it is drawn from, in its order, then
 * those only its own making used, then those only an earlier version's
 * making used; each once, with what the draft states of it.
 */
export function sourcesOf(draft: ReleaseDraft): SourceView[] {
  const carried = new Set(draft.published.activities.map((id) => iriIn(draft, id)));
  const own = usedBy(draft, generatingActivities(draft).filter((iri) => !carried.has(iri)));
  const earlier = usedBy(draft, [...carried]);
  return [...new Set([...draft.root.wasDerivedFrom, ...own, ...earlier])].map((iri) => {
    const said = draft.triples.filter((triple) => triple.subject === iri);
    const first = (predicate: string, kind: ReleaseTerm["kind"]) => said.find((triple) => triple.predicate === predicate && triple.object.kind === kind);
    const shown = [first(DCTERMS_TITLE, "literal"), first(DCTERMS_CREATOR, "literal"), first(DCTERMS_LICENSE, "iri"), first(RDFS_COMMENT, "literal")];
    const value = (triple: DraftTriple | undefined) => triple?.object.value ?? "";
    return {
      iri,
      title: value(shown[0]),
      creator: value(shown[1]),
      license: value(shown[2]),
      evidence: value(shown[3]),
      derivedFrom: draft.root.wasDerivedFrom.includes(iri),
      used: own.includes(iri),
      usedEarlier: earlier.includes(iri),
      others: said.filter((triple) => !shown.includes(triple)).map(({ predicate, object }) => ({ predicate, object })),
    };
  });
}

/** A source's address: an http(s) URL, as a browser writes it. */
export function sourceIri(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Whether a source's licence can be saved as its form gives it: none,
 * the one it states already (`was`), or an http(s) address (sourceIri).
 * A name such as "CC BY 4.0" is no address.
 */
export function sourceLicenseValid(license: string, was = ""): boolean {
  const text = license.trim();
  return text === "" || text === was || sourceIri(text) !== null;
}

/** The change that gives a source (by its IRI) what its form says (its licence one sourceLicenseValid takes), its other statements kept. */
export function sourceChange(iri: string, form: SourceForm, others: SourceView["others"] = []): DraftChange {
  const text = (value: string): ReleaseText => ({ kind: "literal", value: value.trim(), language: "", datatype: XSD_STRING });
  const statements = [
    ...(form.title.trim() === "" ? [] : [{ predicate: DCTERMS_TITLE, object: text(form.title) }]),
    ...(form.creator.trim() === "" ? [] : [{ predicate: DCTERMS_CREATOR, object: text(form.creator) }]),
    ...(form.license.trim() === "" ? [] : [{ predicate: DCTERMS_LICENSE, object: { kind: "iri" as const, value: sourceIri(form.license) ?? form.license.trim() } }]),
    ...(form.evidence.trim() === "" ? [] : [{ predicate: RDFS_COMMENT, object: text(form.evidence) }]),
    ...others,
  ];
  return { kind: "setSource", iri, source: { statements, derivedFrom: form.derivedFrom, used: form.used } };
}

// --- Checks

/** An activity of the draft beside its own making: a check of this version, or one carried from an earlier version. */
export interface CheckView {
  id: string;
  /** How an earlier version was made: shown, never edited. */
  carried: boolean;
  /** What it calls itself (rdfs:label). */
  label: ReleaseText[];
  /** What it says (rdfs:comment). */
  comments: ReleaseText[];
  /** When it ended (prov:endedAtTime), "" when it does not say. */
  endedAt: string;
  /** The check it records, to edit; null when it was written otherwise (it can only be deleted). */
  activity: CheckActivity | null;
}

/** The activities of the draft but its own making: its checks, then those carried from earlier versions, in order. */
export function checksOf(draft: ReleaseDraft): CheckView[] {
  const making = new Set(generatingActivities(draft));
  const views = activitiesOf(draft).flatMap((id): CheckView[] => {
    const carried = draft.published.activities.includes(id);
    const iri = iriIn(draft, id);
    if (making.has(iri) && !carried) return [];
    const said = draft.triples.filter((triple) => triple.subject === iri);
    const texts = (predicate: string) =>
      said.filter((triple) => triple.predicate === predicate && triple.object.kind === "literal").map((triple) => triple.object as ReleaseText);
    return [
      {
        id,
        carried,
        label: texts("http://www.w3.org/2000/01/rdf-schema#label"),
        comments: texts(RDFS_COMMENT),
        endedAt: texts(`${PROV}endedAtTime`)[0]?.value ?? "",
        activity: carried ? null : readCheckActivity(draft, id),
      },
    ];
  });
  return [...views.filter((view) => !view.carried), ...views.filter((view) => view.carried)];
}

/** A new check's id: `check-1`, `check-2`, … the first free. */
export function checkIdFor(draft: ReleaseDraft): string {
  const taken = takenIds(draft);
  let n = 1;
  while (taken.has(`check-${n}`)) n++;
  return `check-${n}`;
}
