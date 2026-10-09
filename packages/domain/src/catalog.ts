import { TOPICS } from "@solid-memo/vocab/concepts.generated";
import { AppError } from "./appError";
import { DATA_THEME_SCHEME } from "./dcat";
import { chosenLicense } from "./license";
import type { AgentV1, CatalogV1 } from "@solid-memo/vocab/types.generated";

/**
 * An instance's catalogue: the dcat:Catalog of its decks, the subject
 * <catalog.ttl#catalog> (see docs/data-model.md). It says whose decks
 * they are — the pod's owner publishes them — so other applications can
 * read the instance as a DCAT catalogue; its datasets are the decks.
 */
export interface Catalog {
  /** The instance's name, as its meta document and its type index registrations have it too. */
  title: string;
  description: string;
  /** The pod's owner: their WebID, named by their profile's foaf:name. */
  publisher: { webId: string; name: string };
  /** URL of the licence the decks are offered under, when stated. */
  license?: string;
  /** ISO dateTime of the catalogue's last change, when stated (another app's: this one keeps it). */
  modified?: string;
}

/** What the Studio edits of a catalogue (UseCases.describeCatalog). */
export interface CatalogAbout {
  description: string;
  license?: string;
}

/** The description a catalogue gets: DCAT-AP asks one of every catalogue. */
export function defaultCatalogDescription(title: string): string {
  return `Flashcard decks of the Solid Memo instance ${title}.`;
}

/**
 * The catalogue with its description and licence as an edit gives them:
 * the description trimmed, and required (catalogNeedsDescription), as
 * DCAT-AP asks of every catalogue; the licence none, one of
 * KNOWN_LICENSES, or the one it has (chosenLicense).
 */
export function describedCatalog(catalog: Catalog, about: CatalogAbout): Catalog {
  const description = about.description.trim();
  if (description === "") throw new AppError("catalogNeedsDescription");
  const license = chosenLicense(about.license, catalog.license);
  const { license: _, ...rest } = catalog;
  return { ...rest, description, ...(license === undefined ? {} : { license }) };
}

/**
 * The catalogue of an instance renamed: its title the new name, and a
 * description that was the one the old name gets (defaultCatalogDescription)
 * the one the new name gets; the user's own stays.
 */
export function renamedCatalog(catalog: Catalog, name: string): Catalog {
  return {
    ...catalog,
    title: name,
    description:
      catalog.description === defaultCatalogDescription(catalog.title) ? defaultCatalogDescription(name) : catalog.description,
  };
}

/** The catalogue's record, listing the decks as its datasets. */
export function catalogToRecord(catalog: Catalog, deckUrls: readonly string[]): CatalogV1 {
  return {
    title: catalog.title,
    description: catalog.description,
    publisher: catalog.publisher.webId,
    ...(catalog.license === undefined ? {} : { license: catalog.license }),
    ...(catalog.modified === undefined ? {} : { modified: catalog.modified }),
    themeTaxonomy: [TOPICS.iri, DATA_THEME_SCHEME],
    dataset: [...deckUrls],
  };
}

/** The publisher as the agent node the catalogue names. */
export function publisherToRecord(catalog: Catalog): AgentV1 {
  return { name: catalog.publisher.name };
}

export function catalogFromRecord(data: CatalogV1, publisherName: string): Catalog {
  return {
    title: data.title,
    description: data.description,
    publisher: { webId: data.publisher, name: publisherName },
    ...(data.license === undefined ? {} : { license: data.license }),
    ...(data.modified === undefined ? {} : { modified: data.modified }),
  };
}
