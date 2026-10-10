import { directionOfConcept } from "../concepts.ts";
import { copyKeywords } from "../keywords.ts";
import type { LibraryDeck, LibrarySource } from "../library.ts";
import { iriIn, type ReleaseDraft } from "./releaseDraft.ts";
import { DCTERMS_NS } from "./releaseModel.ts";

/**
 * A draft as the library lists the release it will be (docs/studio.md,
 * The listing preview): the LibraryDeck its learners would see, built
 * from the draft alone. It is the only release of its series here, its
 * cards those in use, its authors named by the agents the draft
 * describes, and its sources by what the draft says of them.
 */
export function draftLibraryDeck(draft: ReleaseDraft): LibraryDeck {
  const { root } = draft;
  const names = new Map(draft.agents.map((agent) => [iriIn(draft, agent.id), agent.data.name]));
  const said = (subject: string, predicate: string) =>
    draft.triples.filter((triple) => triple.subject === subject && triple.predicate === predicate).map((triple) => triple.object);
  const version = root.version ?? "1";
  return {
    url: draft.url,
    seriesUrl: root.inSeries ?? draft.url,
    version,
    ...(root.versionNotes === undefined ? {} : { versionNotes: root.versionNotes }),
    releases: [
      {
        url: draft.url,
        version,
        ...(root.issued === undefined ? {} : { issued: root.issued }),
        ...(root.versionNotes === undefined ? {} : { notes: root.versionNotes }),
      },
    ],
    themes: [...root.theme],
    keywords: copyKeywords(root.keyword),
    title: root.title ?? {},
    cardCount: draft.cards.filter((card) => card.data.deprecated !== true).length,
    authors: root.creator.map((agent) => names.get(agent) ?? agent),
    ...(root.license === undefined ? {} : { license: root.license }),
    ...(root.description === undefined ? {} : { description: root.description }),
    // The draft shape names a concept of the directions.
    direction: directionOfConcept(root.studyDirection)!,
    ...(root.created === undefined ? {} : { createdAt: root.created }),
    ...(root.modified === undefined ? {} : { modifiedAt: root.modified }),
    sources: root.wasDerivedFrom.map((url): LibrarySource => {
      const title = said(url, `${DCTERMS_NS}title`).find((term) => term.kind === "literal");
      const license = said(url, `${DCTERMS_NS}license`).find((term) => term.kind === "iri");
      return {
        url,
        ...(title === undefined ? {} : { title: title.value }),
        authors: said(url, `${DCTERMS_NS}creator`).filter((term) => term.kind === "literal").map((term) => term.value),
        ...(license === undefined ? {} : { license: license.value }),
      };
    }),
    ...(draft.course ? { isCourse: true as const } : {}),
  };
}
