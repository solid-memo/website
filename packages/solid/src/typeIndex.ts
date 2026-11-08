// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { limitedFetch, MAX_PROFILE_DOCUMENTS, PROFILE_LIMITS } from "./client/readLimits";
import { getProfileStorages, getSourceUrl } from "./client/resources";
import {
  type Dataset,
  type SourcedDataset,
  type Subject,
  buildThing,
  createSolidDataset,
  createThing,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeThings,
  setThing,
  setThings,
} from "./client/rdf";
import {
  getSolidDatasetOrNull,
  PreconditionFailedError,
  readDataset,
  saveDataset,
} from "./datasets";
import { ensureTrailingSlash } from "./urls";
import { DCAT, DCTERMS, FOAF, PIM, RDF, RDFS, SM, SOLID } from "./vocab";
import { createPlacesFetch, isInPlaces, profilePlacesOf } from "./profilePlaces";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { AppError } from "@solid-memo/domain/appError";
import {
  cardsContainerOf,
  catalogNodeUrlOf,
  catalogUrlOf,
  historyContainerOf,
  isInstanceAddress,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { draftsContainerOf } from "@solid-memo/domain/release/draftLayout";

type Fetch = typeof globalThis.fetch;
export type TypeIndexKind = "private" | "public";

export interface TypeIndexes {
  privateIndexUrl: string | null;
  publicIndexUrl: string | null;
  /**
   * What the indexes are read and written through: as the user in the
   * profile's own places (profilePlacesOf: the WebID's origin, its
   * document's, and the storages the profile names), any other read as
   * no one and any other write refused (`writeOutsidePod`).
   */
  fetch: Fetch;
  /**
   * Whether `url` is in the profile's own places. An index outside them
   * may be someone else's, so nothing in it is the user's: the instance
   * repository takes it as none (ownTypeIndexes), and ensureTypeIndex
   * makes the user's own instead.
   */
  inPlaces: (url: string) => boolean;
}

/**
 * Locate both type indexes for a WebID. Links are looked up on the WebID
 * subject in the WebID document and in any extended profile documents
 * (rdfs:seeAlso / foaf:isPrimaryTopicOf — e.g. Inrupt PodSpaces keeps a
 * read-only WebID document and a writable profile in the pod). The
 * private index is additionally looked up in the pim:preferencesFile
 * (per spec). Only the documents in the profile's own places are read,
 * as the user; a link to a document anywhere else, someone else's, is
 * left alone. `publicFetch` reads an index outside those places.
 */
export async function locateTypeIndexes(
  webId: string,
  fetch: Fetch,
  publicFetch: Fetch,
): Promise<TypeIndexes> {
  const profileFetch = profileFetchOf(fetch);
  const profileDataset = await readDataset(webId, profileFetch);
  const documentUrl = getSourceUrl(profileDataset);
  const profile = getThing(profileDataset, webId);
  if (profile === null) {
    return {
      privateIndexUrl: null,
      publicIndexUrl: null,
      ...placesOf(profilePlacesOf(webId, documentUrl, []), fetch, publicFetch),
    };
  }

  let publicIndexUrl = getUrl(profile, SOLID.publicTypeIndex);
  let privateIndexUrl = getUrl(profile, SOLID.privateTypeIndex);
  const ownPlaces = profilePlacesOf(webId, documentUrl, [profile]);
  const subjects = [profile];
  // Done once both indexes are found and in the profile's places: an
  // extended profile may name the storage an index is in.
  const located = (): boolean => {
    const places = profilePlacesOf(webId, documentUrl, subjects);
    return [publicIndexUrl, privateIndexUrl].every(
      (url) => url !== null && isInPlaces(url, places),
    );
  };

  for (const extendedProfileUrl of extendedProfileUrls(webId, profile, profileDataset)) {
    if (located()) break;
    const subject = await readSubjectSafely(extendedProfileUrl, webId, profileFetch);
    if (subject === null) continue;
    subjects.push(subject);
    publicIndexUrl ??= getUrl(subject, SOLID.publicTypeIndex);
    privateIndexUrl ??= getUrl(subject, SOLID.privateTypeIndex);
  }

  if (privateIndexUrl === null) {
    const preferencesFileUrl = getUrl(profile, PIM.preferencesFile);
    if (preferencesFileUrl !== null && isInPlaces(preferencesFileUrl, ownPlaces)) {
      const subject = await readSubjectSafely(preferencesFileUrl, webId, profileFetch);
      privateIndexUrl = subject === null ? null : getUrl(subject, SOLID.privateTypeIndex);
    }
  }

  const places = profilePlacesOf(webId, documentUrl, subjects);
  // Of several links, one in the profile's own places: the index the app made beside one elsewhere.
  const ownLink = (predicate: string): string | null =>
    subjects
      .flatMap((subject) => getUrlAll(subject, predicate))
      .find((url) => isInPlaces(url, places)) ?? null;
  return {
    privateIndexUrl: ownLink(SOLID.privateTypeIndex) ?? privateIndexUrl,
    publicIndexUrl: ownLink(SOLID.publicTypeIndex) ?? publicIndexUrl,
    ...placesOf(places, fetch, publicFetch),
  };
}

/** The indexes' fetch and place check (TypeIndexes) for the profile's own `places`. */
function placesOf(
  places: readonly string[],
  fetch: Fetch,
  publicFetch: Fetch,
): Pick<TypeIndexes, "fetch" | "inPlaces"> {
  return {
    fetch: createPlacesFetch(places, fetch, publicFetch),
    inPlaces: (url) => isInPlaces(url, places),
  };
}

/** The fetch of each profileFetchOf, so that what it read is kept (datasets.ts) from one call to the next. */
const PROFILE_FETCHES = new WeakMap<Fetch, Fetch>();

/**
 * `fetch`, its answers read under PROFILE_LIMITS, as the storage lookup
 * reads the profile's documents (solidStorageGateway.ts): the WebID
 * document, the extended profile documents and the preferences file are
 * read through it, and written through it too, so that a write is kept
 * where the read was (datasets.ts). One past the limits is refused: the
 * WebID document fails the lookup, any other is left out.
 */
function profileFetchOf(fetch: Fetch): Fetch {
  let profileFetch = PROFILE_FETCHES.get(fetch);
  if (profileFetch === undefined) {
    profileFetch = limitedFetch(fetch, PROFILE_LIMITS);
    PROFILE_FETCHES.set(fetch, profileFetch);
  }
  return profileFetch;
}

/**
 * Extended profile documents linked from the WebID subject, deduplicated
 * and excluding the WebID document itself (which is commonly its own
 * foaf:isPrimaryTopicOf), in the profile's own places (profilePlacesOf)
 * alone, and no more than MAX_PROFILE_DOCUMENTS of them, as the storage
 * lookup reads.
 */
function extendedProfileUrls(
  webId: string,
  profile: Subject,
  profileDataset: SourcedDataset,
): string[] {
  const documentUrl = getSourceUrl(profileDataset);
  const places = profilePlacesOf(webId, documentUrl, [profile]);
  const self = new Set([stripFragment(profile.url), stripFragment(documentUrl)]);
  const urls = [
    ...getUrlAll(profile, RDFS.seeAlso),
    ...getUrlAll(profile, FOAF.isPrimaryTopicOf),
  ].map(stripFragment);
  return [...new Set(urls)]
    .filter((url) => !self.has(url) && isInPlaces(url, places))
    .slice(0, MAX_PROFILE_DOCUMENTS);
}

function stripFragment(url: string): string {
  return url.split("#")[0];
}

/** The WebID subject in a document, or null if unreadable or absent. */
async function readSubjectSafely(
  documentUrl: string,
  webId: string,
  fetch: Fetch,
): Promise<Subject | null> {
  try {
    const dataset = await readDataset(documentUrl, fetch);
    return getThing(dataset, webId);
  } catch {
    return null;
  }
}

/**
 * Create a type index document under <storage>settings/ and link it from
 * the profile, in one of the user's own storages (ownStorageFor), never
 * where the instance it is made for happens to be: an index on a server
 * someone else runs would be where every Solid app reads the user's
 * registrations and writes theirs. An index document already at that URL
 * (e.g. left behind by an earlier run whose profile link failed) is
 * adopted as-is rather than overwritten. Throws if either write fails.
 */
export async function createTypeIndex(
  kind: TypeIndexKind,
  webId: string,
  nearUrl: string,
  fetch: Fetch,
): Promise<string> {
  const storageRoot = await ownStorageFor(nearUrl, webId, fetch);
  const indexUrl = `${storageRoot}settings/${kind}TypeIndex.ttl`;

  const existing = await getSolidDatasetOrNull(indexUrl, fetch);
  if (existing === null) {
    const indexDocument = setThing(
      createSolidDataset(),
      buildThing(createThing({ url: indexUrl }))
        .addIri(RDF.type, SOLID.TypeIndex)
        .addIri(RDF.type, kind === "public" ? SOLID.ListedDocument : SOLID.UnlistedDocument)
        .build(),
    );
    await saveDataset(indexUrl, indexDocument, fetch);
  }
  await linkTypeIndexFromProfile(kind, webId, indexUrl, fetch);
  return indexUrl;
}

/**
 * Add the type index link to the WebID subject. The WebID document is
 * tried first; when it is not writable (e.g. Inrupt PodSpaces, whose
 * WebID documents live on a read-only identity broker) the extended
 * profile documents are tried in turn. Throws if no candidate accepts
 * the write.
 */
async function linkTypeIndexFromProfile(
  kind: TypeIndexKind,
  webId: string,
  indexUrl: string,
  fetch: Fetch,
): Promise<void> {
  const profileFetch = profileFetchOf(fetch);
  const profileDataset = await readDataset(webId, profileFetch);
  const profile = getThing(profileDataset, webId);
  if (profile === null) {
    throw new AppError("profileNoSubject", { webId });
  }
  const predicate = kind === "public" ? SOLID.publicTypeIndex : SOLID.privateTypeIndex;

  const failures: string[] = [];
  try {
    const updated = setThing(
      profileDataset,
      buildThing(profile).addIri(predicate, indexUrl).build(),
    );
    await saveDataset(getSourceUrl(profileDataset), updated, profileFetch);
    return;
  } catch (error) {
    failures.push(describeFailure(getSourceUrl(profileDataset), error));
  }

  for (const documentUrl of extendedProfileUrls(webId, profile, profileDataset)) {
    try {
      const dataset = await readDataset(documentUrl, profileFetch);
      const subject = getThing(dataset, webId) ?? createThing({ url: webId });
      const updated = setThing(dataset, buildThing(subject).addIri(predicate, indexUrl).build());
      await saveDataset(documentUrl, updated, profileFetch);
      return;
    } catch (error) {
      failures.push(describeFailure(documentUrl, error));
    }
  }

  throw new AppError(
    kind === "private" ? "privateTypeIndexNotLinked" : "publicTypeIndexNotLinked",
    {
      index: indexUrl,
      failures: failures.map((failure) => `- ${failure}`).join("\n"),
    },
  );
}

function describeFailure(documentUrl: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<${documentUrl}>: ${message}`;
}

/**
 * Find the target index, creating it (and its profile link) if missing
 * or outside the profile's own places (TypeIndexes.inPlaces); and what
 * it is read and written through (TypeIndexes).
 */
export async function ensureTypeIndex(
  kind: TypeIndexKind,
  webId: string,
  nearUrl: string,
  fetch: Fetch,
  publicFetch: Fetch,
): Promise<{ url: string; fetch: Fetch }> {
  const indexes = await locateTypeIndexes(webId, fetch, publicFetch);
  const found = kind === "public" ? indexes.publicIndexUrl : indexes.privateIndexUrl;
  const existing = found !== null && indexes.inPlaces(found) ? found : null;
  return {
    url: existing ?? (await createTypeIndex(kind, webId, nearUrl, fetch)),
    fetch: indexes.fetch,
  };
}

export interface InstanceRegistration {
  containerUrl: string;
  title: string | null;
}

/**
 * All sm:Instance registrations in a type index document: those naming
 * an http(s) address with no query, fragment or dot segment
 * (isInstanceAddress), as written. A registration is data any app may
 * have written, and every address of the instance is made from it.
 */
export async function readInstanceRegistrations(
  indexUrl: string,
  fetch: Fetch,
): Promise<InstanceRegistration[]> {
  const dataset = await readDataset(indexUrl, fetch);
  const registrations: InstanceRegistration[] = [];
  for (const thing of getThingAll(dataset)) {
    const types = getUrlAll(thing, RDF.type);
    if (!types.includes(SOLID.TypeRegistration)) continue;
    if (!getUrlAll(thing, SOLID.forClass).includes(SM.Instance)) continue;
    const containerUrl = getUrl(thing, SOLID.instanceContainer) ?? getUrl(thing, SOLID.instance);
    if (containerUrl === null || !isInstanceAddress(containerUrl)) continue;
    registrations.push({
      containerUrl,
      title: getStringNoLocale(thing, DCTERMS.title),
    });
  }
  return registrations;
}

/**
 * The registrations of an instance's data Solid Memo recognizes as its
 * own (docs/data-model.md "Discovery chain"): the class and what it
 * names. Only the instance's own is written. Earlier versions of the
 * app wrote the others too, one per class of the instance's data; they
 * are known here so that removing or renaming an instance still finds
 * them in the user's type indexes.
 */
const REGISTERED_CLASSES = {
  instance: { forClass: SM.Instance, target: (container: string) => container },
  catalog: { forClass: DCAT.Catalog, target: catalogNodeUrlOf },
  deck: { forClass: SM.Deck, target: catalogUrlOf },
  card: { forClass: SM.Card, target: cardsContainerOf },
  reviewState: { forClass: SM.ReviewState, target: reviewsContainerOf },
  answer: { forClass: SM.Answer, target: historyContainerOf },
  // A draft's release document is an sm:Deck too: the drafts were told from the decks by where they are.
  draft: { forClass: SM.Deck, target: draftsContainerOf },
} satisfies Record<string, { forClass: string; target: (container: string) => string }>;
type RegisteredClass = keyof typeof REGISTERED_CLASSES;
const REGISTERED_CLASS_NAMES = Object.keys(REGISTERED_CLASSES) as RegisteredClass[];

/**
 * What a registration registers of the instance's data of one class,
 * under either predicate: the instance's container, a missing trailing
 * slash ignored, as reading does; every other class's resource by its
 * exact IRI, so a resource anywhere else below the container, another
 * app's, is never taken for the instance's.
 */
function registeredOf(
  registration: Subject,
  dataClass: RegisteredClass,
  container: string,
): string[] {
  const { forClass, target } = REGISTERED_CLASSES[dataClass];
  if (!getUrlAll(registration, RDF.type).includes(SOLID.TypeRegistration)) return [];
  if (!getUrlAll(registration, SOLID.forClass).includes(forClass)) return [];
  const ours = target(container);
  const matches =
    dataClass === "instance"
      ? (url: string) => ensureTrailingSlash(url) === ours
      : (url: string) => url === ours;
  return registeredUrls(registration).filter(matches);
}

/** How many times a change to a type index is made against the index as it is now, when it keeps changing meanwhile. */
const ATTEMPTS = 3;

/**
 * Change a type index document as it is now: read it, apply `change`,
 * and save the result only if the document is as it was read
 * (If-Match); when it changed meanwhile (412), read it and apply the
 * change again, ATTEMPTS times in all, then throw. A change that
 * returns the dataset it was given saves nothing. What the last change
 * said.
 */
async function changeIndex<R>(
  indexUrl: string,
  fetch: Fetch,
  change: (dataset: SourcedDataset) => { dataset: Dataset; result: R },
): Promise<R> {
  for (let attempt = 1; ; attempt++) {
    const read = await readDataset(indexUrl, fetch);
    const { dataset, result } = change(read);
    if (dataset === read) return result;
    try {
      await saveDataset(indexUrl, dataset, fetch);
      return result;
    } catch (error) {
      if (!(error instanceof PreconditionFailedError) || attempt === ATTEMPTS) throw error;
    }
  }
}

/**
 * Register the instance in a type index document: a
 * solid:TypeRegistration for sm:Instance naming its container, titled
 * with the instance's name, by which Solid Memo finds it. Its other data
 * is reached from the instance, and gets no registration of its own.
 * Saves nothing when the index already registers it (see changeIndex):
 * the same class, naming the container with or without its trailing
 * slash.
 */
export async function addInstanceRegistration(
  indexUrl: string,
  { instanceUrl, title }: { instanceUrl: string; title: string },
  newId: () => string,
  fetch: Fetch,
): Promise<void> {
  const container = ensureTrailingSlash(instanceUrl);
  await changeIndex(indexUrl, fetch, (dataset) => {
    if (
      getThingAll(dataset).some((thing) => registeredOf(thing, "instance", container).length > 0)
    ) {
      return { dataset, result: undefined };
    }
    const registration = buildThing(createThing({ url: `${indexUrl}#sm-inst-${newId()}` }))
      .addIri(RDF.type, SOLID.TypeRegistration)
      .addIri(SOLID.forClass, SM.Instance)
      .addIri(SOLID.instanceContainer, container)
      .addStringNoLocale(DCTERMS.title, title)
      .build();
    return { dataset: setThing(dataset, registration), result: undefined };
  });
}

/**
 * Remove every registration of an instance's data from a type index
 * document (see changeIndex), by what each class's registration names
 * (registeredOf): the container for its sm:Instance registration, and
 * for those earlier versions wrote exactly the instance's catalog
 * (`<container>catalog.ttl#catalog`), catalog document, `decks/`,
 * `reviews/`, `history/` and `drafts/`, never anything else below the
 * container, which may be another app's. A registration that names
 * something else besides keeps it, and loses only the links to the instance's data.
 * Saves only when something was removed. The registrations changed are
 * set in one edit and those removed taken out in one (setThings,
 * removeThings), so many take time that grows with them, not their
 * square.
 */
export async function removeInstanceRegistrations(
  indexUrl: string,
  containerUrl: string,
  fetch: Fetch,
): Promise<void> {
  const container = ensureTrailingSlash(containerUrl);
  await changeIndex(indexUrl, fetch, (dataset) => {
    // Every registration changed set at once, and every one removed taken out at once.
    const changed: Subject[] = [];
    const removed: Subject[] = [];
    for (const thing of getThingAll(dataset)) {
      const ours = REGISTERED_CLASS_NAMES.flatMap((dataClass) =>
        registeredOf(thing, dataClass, container),
      );
      if (ours.length === 0) continue;
      const kept = withoutRegistered(thing, ours);
      if (kept === null) removed.push(thing);
      else changed.push(kept);
    }
    if (changed.length === 0 && removed.length === 0) return { dataset, result: undefined };
    return { dataset: removeThings(setThings(dataset, changed), removed), result: undefined };
  });
}

/** What a registration registers, under either predicate. */
function registeredUrls(registration: Subject): string[] {
  return [
    ...getUrlAll(registration, SOLID.instanceContainer),
    ...getUrlAll(registration, SOLID.instance),
  ];
}

/**
 * The registration without its links to `urls`; null when it registers
 * nothing else, and so is to be removed whole.
 */
function withoutRegistered(registration: Subject, urls: readonly string[]): Subject | null {
  const gone = new Set(urls);
  if (registeredUrls(registration).every((url) => gone.has(url))) return null;
  return urls
    .reduce(
      (current, url) =>
        current.removeUrl(SOLID.instanceContainer, url).removeUrl(SOLID.instance, url),
      buildThing(registration),
    )
    .build();
}

/**
 * Give every registration of an instance's data in a type index document
 * a new title (dcterms:title), in one save (see changeIndex): the
 * instance's, and each one earlier versions wrote for a class of
 * its data, by what it names (registeredOf), all set in one
 * edit (setThings), so many take time that grows with them, not their
 * square. Saves nothing when no registration needs the title.
 */
export async function renameInstanceRegistrations(
  indexUrl: string,
  { containerUrl, title }: { containerUrl: string; title: string },
  fetch: Fetch,
): Promise<void> {
  const container = ensureTrailingSlash(containerUrl);
  await changeIndex(indexUrl, fetch, (dataset) => {
    // Every registration retitled set at once (setThings).
    const renamed = getThingAll(dataset)
      .filter(
        (thing) =>
          getStringNoLocale(thing, DCTERMS.title) !== title &&
          REGISTERED_CLASS_NAMES.some(
            (dataClass) => registeredOf(thing, dataClass, container).length > 0,
          ),
      )
      .map((thing) => buildThing(thing).setStringNoLocale(DCTERMS.title, title).build());
    if (renamed.length === 0) return { dataset, result: undefined };
    return { dataset: setThings(dataset, renamed), result: undefined };
  });
}

/**
 * The user's own storage to keep a type index in, of those their WebID
 * leads to (discoverStorages: pim:storage in their profile, or else the
 * one the WebID's own address is in): the one `url` is in, or else the
 * first. Throws when the WebID leads to none.
 */
async function ownStorageFor(url: string, webId: string, fetch: Fetch): Promise<string> {
  const storages = (
    await createSolidStorageGateway({
      fetch,
      profileStorages: getProfileStorages,
    }).discoverStorages(webId)
  ).map((storage) => ensureTrailingSlash(storage.url));
  const storage = storages.find((root) => url.startsWith(root)) ?? storages[0];
  if (storage === undefined) throw new AppError("typeIndexNoStorage", { webId });
  return storage;
}
