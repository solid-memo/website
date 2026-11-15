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
  readsAsNone,
  saveDataset,
} from "./datasets";
import { ensureTrailingSlash } from "./urls";
import { DCAT, DCTERMS, FOAF, PIM, RDF, RDFS, SM, SOLID } from "./vocab";
import { createPlacesFetch, isInPlaces, profilePlacesOf } from "./profilePlaces";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { AppError } from "@solid-memo/domain/appError";
import type { TypeIndexChoice, TypeIndexKind } from "@solid-memo/domain/typeIndexChoice";
import { rankedFor } from "@solid-memo/domain/typeIndexChoice";
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import {
  OLD_REGISTRATION_CLASSES,
  type OldRegistrationClass,
  type RegistrationTarget,
} from "@solid-memo/domain/instance";
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

/** A link from the user's profile to a type index of theirs (locateTypeIndexes). */
export interface TypeIndexLink {
  url: string;
  kind: TypeIndexKind;
  /** Whether the preferences file links it (a private index alone). */
  fromPreferences: boolean;
}

export interface TypeIndexes {
  /**
   * Every type index the profile links in its own places, each kind's
   * once by address, the private ones first, no more than
   * MAX_PROFILE_DOCUMENTS of each kind. One outside them may be someone
   * else's, so nothing in it is the user's, and it is left out.
   */
  links: TypeIndexLink[];
  /**
   * What the indexes are read and written through: as the user in the
   * profile's own places (profilePlacesOf: the WebID's origin, its
   * document's, and the storages the profile names), any other read as
   * no one and any other write refused (`writeOutsidePod`).
   */
  fetch: Fetch;
  /**
   * Whether `url` is in the profile's own places: an index entered by
   * its address outside them is refused (ensureTypeIndex).
   */
  inPlaces: (url: string) => boolean;
}

/**
 * Every link to a type index of the WebID's (docs/data-model.md
 * "Discovery chain"): solid:privateTypeIndex and solid:publicTypeIndex
 * on the WebID subject in the WebID document and in every extended
 * profile document (rdfs:seeAlso / foaf:isPrimaryTopicOf, e.g. Inrupt
 * PodSpaces keeps a read-only WebID document and a writable profile in
 * the pod), and solid:privateTypeIndex in the pim:preferencesFile, where
 * the specification keeps the private index. A public link there is left
 * out: the file is private, so no one else finds it. A pod made long ago
 * may link several of a kind, the one an app wrote first and the one
 * another wrote later, so each is kept, and the user chooses
 * (rankedFor). Only the documents in the profile's own places are read,
 * as the user, and only the links into them are kept: a document
 * anywhere else may be someone else's. `publicFetch` reads anything
 * outside those places.
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
    return { links: [], ...placesOf(profilePlacesOf(webId, documentUrl, []), fetch, publicFetch) };
  }

  const subjects = [profile];
  for (const extendedProfileUrl of extendedProfileUrls(webId, profile, profileDataset)) {
    const subject = await readSubjectSafely(extendedProfileUrl, webId, profileFetch);
    if (subject !== null) subjects.push(subject);
  }
  // An extended profile may name the storage an index or the preferences file is in.
  const places = profilePlacesOf(webId, documentUrl, subjects);

  const preferences: Subject[] = [];
  const preferencesFileUrl = getUrl(profile, PIM.preferencesFile);
  if (preferencesFileUrl !== null && isInPlaces(preferencesFileUrl, places)) {
    const subject = await readSubjectSafely(preferencesFileUrl, webId, profileFetch);
    if (subject !== null) preferences.push(subject);
  }

  const linksOf = (
    kind: TypeIndexKind,
    predicate: string,
    preferenceSubjects: readonly Subject[],
  ): TypeIndexLink[] => {
    const fromPreferences = new Set(
      preferenceSubjects.flatMap((subject) => getUrlAll(subject, predicate)),
    );
    const urls = [
      ...subjects.flatMap((subject) => getUrlAll(subject, predicate)),
      ...fromPreferences,
    ].filter((url) => isInPlaces(url, places));
    return [...new Set(urls)]
      .slice(0, MAX_PROFILE_DOCUMENTS)
      .map((url) => ({ url, kind, fromPreferences: fromPreferences.has(url) }));
  };
  return {
    links: [
      ...linksOf("private", SOLID.privateTypeIndex, preferences),
      // The preferences file is private: a public link there is no one else's to find.
      ...linksOf("public", SOLID.publicTypeIndex, []),
    ],
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

/**
 * The WebID subject in a document, or null if the document or the
 * subject is not there (readsAsNone). A document that could not be read
 * now fails the lookup: an index it names may be there, and taking it as
 * none would show the user no instances.
 */
async function readSubjectSafely(
  documentUrl: string,
  webId: string,
  fetch: Fetch,
): Promise<Subject | null> {
  try {
    const dataset = await readDataset(documentUrl, fetch);
    return getThing(dataset, webId);
  } catch (error) {
    if (readsAsNone(error)) return null;
    throw error;
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
 * The type indexes the profile links (locateTypeIndexes) that the user
 * can read now, each once, with what each says it is and holds, and
 * whether anyone may read it without logging in, asked of `publicFetch`
 * (docs/data-model.md "Choosing a type index"). One that cannot be read,
 * whatever the reason, is left out: nothing can be registered in it.
 */
export async function readTypeIndexChoices(
  indexes: TypeIndexes,
  publicFetch: Fetch,
): Promise<TypeIndexChoice[]> {
  const urls = [...new Set(indexes.links.map((link) => link.url))];
  const choices = await Promise.all(
    urls.map(async (url): Promise<TypeIndexChoice | null> => {
      const links = indexes.links.filter((link) => link.url === url);
      let dataset: SourcedDataset;
      try {
        dataset = await readDataset(url, indexes.fetch);
      } catch {
        return null;
      }
      const kinds = links.map((link) => link.kind);
      return {
        url,
        kinds,
        fromPreferences: links.some((link) => link.fromPreferences),
        typeFit: kinds.length > 1 ? "none" : typeFitOf(typesOf(dataset, url), kinds[0]),
        holdsInstances: instanceRegistrationsIn(dataset).length > 0,
        readableByAnyone: await readableByAnyone(url, publicFetch),
      };
    }),
  );
  return choices.filter((choice) => choice !== null);
}

/** The types the document at `url` gives itself. */
function typesOf(dataset: Dataset, url: string): string[] {
  const document = getThing(dataset, documentUrlOf(url));
  return document === null ? [] : getUrlAll(document, RDF.type);
}

/** Which kind of type index each document type says a document is. */
const KIND_TYPES = {
  private: SOLID.UnlistedDocument,
  public: SOLID.ListedDocument,
} satisfies Record<TypeIndexKind, string>;

function typeFitOf(types: readonly string[], kind: TypeIndexKind): TypeIndexChoice["typeFit"] {
  if (types.includes(KIND_TYPES[kind])) return "match";
  const other = kind === "private" ? "public" : "private";
  return types.includes(KIND_TYPES[other]) ? "other" : "none";
}

/**
 * Whether a read of `url` as no one is let through: false when it is
 * refused or the document is not there to anyone (401, 403, 404), null
 * when the server says nothing that tells, or does not answer.
 */
async function readableByAnyone(url: string, publicFetch: Fetch): Promise<boolean | null> {
  try {
    const response = await publicFetch(url, { method: "HEAD" });
    if (response.ok) return true;
    return [401, 403, 404].includes(response.status) ? false : null;
  } catch {
    return null;
  }
}

/**
 * The type index to register an instance in, for `target`
 * (RegistrationTarget), and what it is read and written through
 * (TypeIndexes):
 *
 * - of a kind, the user's best of that kind (rankedFor) they can read
 *   now; when there is none, a new one, made in their own storage and
 *   linked from their profile (createTypeIndex), and a public one made
 *   readable by anyone with `share`, so that other apps find what it
 *   registers;
 * - by its address, one the profile links, or else one in one of the
 *   user's own storages that the user can read and that says it is a
 *   solid:TypeIndex, then linked from the profile as the kind its type
 *   says (adoptTypeIndex), as Solid Memo finds its instances only in the
 *   indexes the profile links.
 */
export async function ensureTypeIndex(
  target: RegistrationTarget,
  webId: string,
  nearUrl: string,
  fetch: Fetch,
  publicFetch: Fetch,
  share: (indexUrl: string) => Promise<boolean>,
): Promise<{ url: string; fetch: Fetch }> {
  const indexes = await locateTypeIndexes(webId, fetch, publicFetch);
  if (typeof target !== "string") {
    return {
      url: await adoptTypeIndex(target.indexUrl, webId, indexes, fetch),
      fetch: indexes.fetch,
    };
  }
  const best = rankedFor(await readTypeIndexChoices(indexes, publicFetch), target)[0];
  if (best !== undefined) return { url: best.url, fetch: indexes.fetch };
  const url = await createTypeIndex(target, webId, nearUrl, fetch);
  // A public index no one else can read is one no other app finds: whether the grant took is seen in the next choice.
  if (target === "public") await share(url);
  return { url, fetch: indexes.fetch };
}

/**
 * A type index the user entered by its address: one the profile links
 * as it is; else one in the profile's own places and in one of the
 * user's own storages (ownStorages, typeIndexOutsidePod), that the user
 * can read and that says it is a solid:TypeIndex (notATypeIndex), then
 * linked from the profile, as public when it says it is a
 * solid:ListedDocument and as private otherwise. The profile's places
 * hold the whole origin of the WebID, which on a server that keeps many
 * users' pods on one origin holds theirs too: they say where the
 * profile may be read, never where an index the profile links may be.
 * A read that may work when tried again fails as it did.
 */
async function adoptTypeIndex(
  indexUrl: string,
  webId: string,
  indexes: TypeIndexes,
  fetch: Fetch,
): Promise<string> {
  if (indexes.links.some((link) => link.url === indexUrl)) return indexUrl;
  if (!indexes.inPlaces(indexUrl) || !isInPlaces(indexUrl, await ownStorages(webId, fetch))) {
    throw new AppError("typeIndexOutsidePod", { url: indexUrl });
  }
  let dataset: SourcedDataset;
  try {
    dataset = await readDataset(indexUrl, indexes.fetch);
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (readsAsNone(error) || status === 401 || status === 403) {
      throw new AppError("notATypeIndex", { url: indexUrl });
    }
    throw error;
  }
  const types = typesOf(dataset, indexUrl);
  if (!types.includes(SOLID.TypeIndex)) throw new AppError("notATypeIndex", { url: indexUrl });
  const kind = types.includes(SOLID.ListedDocument) ? "public" : "private";
  await linkTypeIndexFromProfile(kind, webId, indexUrl, fetch);
  return indexUrl;
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
  return instanceRegistrationsIn(await readDataset(indexUrl, fetch));
}

/** The sm:Instance registrations in a type index document (readInstanceRegistrations). */
function instanceRegistrationsIn(dataset: Dataset): InstanceRegistration[] {
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
 * app wrote the others too, one per class of the instance's data, each
 * with a subject whose fragment starts with the class's `idPrefix` and
 * a dash (`#sm-card-…`); they are known here so that removing or
 * renaming an instance still finds them in the user's type indexes, and
 * so that the user can remove them (removeOldRegistrations).
 */
const REGISTERED_CLASSES = {
  instance: { forClass: SM.Instance, target: (container: string) => container },
  catalog: { forClass: DCAT.Catalog, target: catalogNodeUrlOf, idPrefix: "sm-cat" },
  deck: { forClass: SM.Deck, target: catalogUrlOf, idPrefix: "sm-deck" },
  card: { forClass: SM.Card, target: cardsContainerOf, idPrefix: "sm-card" },
  reviewState: { forClass: SM.ReviewState, target: reviewsContainerOf, idPrefix: "sm-review" },
  answer: { forClass: SM.Answer, target: historyContainerOf, idPrefix: "sm-answer" },
  // A draft's release document is an sm:Deck too: the drafts were told from the decks by where they are.
  draft: { forClass: SM.Deck, target: draftsContainerOf, idPrefix: "sm-draft" },
} satisfies Record<
  "instance" | OldRegistrationClass,
  { forClass: string; target: (container: string) => string; idPrefix?: string }
>;
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
 * something else besides keeps it, and loses only the links to the
 * instance's data. Saves only when something was removed
 * (removeRegistered).
 */
export async function removeInstanceRegistrations(
  indexUrl: string,
  containerUrl: string,
  fetch: Fetch,
): Promise<void> {
  const container = ensureTrailingSlash(containerUrl);
  await removeRegistered(indexUrl, fetch, (thing) =>
    REGISTERED_CLASS_NAMES.flatMap((dataClass) => registeredOf(thing, dataClass, container)),
  );
}

/**
 * Which of the registrations earlier versions wrote for an instance's
 * data a type index document holds (oldRegisteredOf), by class, in
 * OLD_REGISTRATION_CLASSES order. Reads only.
 */
export async function readOldRegistrations(
  indexUrl: string,
  containerUrl: string,
  fetch: Fetch,
): Promise<OldRegistrationClass[]> {
  const container = ensureTrailingSlash(containerUrl);
  const things = getThingAll(await readDataset(indexUrl, fetch));
  return OLD_REGISTRATION_CLASSES.filter((dataClass) =>
    things.some((thing) => oldRegisteredOf(thing, dataClass, indexUrl, container).length > 0),
  );
}

/**
 * Remove from a type index document the registrations earlier versions
 * wrote for an instance's data (oldRegisteredOf), and nothing else:
 * never an sm:Instance registration, and of a registration that names
 * something else besides, only the link to the instance's data. One
 * save, made only when something was removed (removeRegistered).
 */
export async function removeOldRegistrations(
  indexUrl: string,
  containerUrl: string,
  fetch: Fetch,
): Promise<void> {
  const container = ensureTrailingSlash(containerUrl);
  await removeRegistered(indexUrl, fetch, (thing) =>
    OLD_REGISTRATION_CLASSES.flatMap((dataClass) =>
      oldRegisteredOf(thing, dataClass, indexUrl, container),
    ),
  );
}

/**
 * What a registration earlier versions wrote for the instance's data of
 * one class registers (registeredOf), when it is surely one of theirs:
 * its subject is in the index document, with a fragment that starts with
 * the class's idPrefix and a dash, as they named it, and it is no
 * sm:Instance registration, which is kept whole. Another registration
 * naming the same, which may be another app's, registers nothing here.
 */
function oldRegisteredOf(
  registration: Subject,
  dataClass: OldRegistrationClass,
  indexUrl: string,
  container: string,
): string[] {
  const ownId = `${documentUrlOf(indexUrl)}#${REGISTERED_CLASSES[dataClass].idPrefix}-`;
  if (!registration.url.startsWith(ownId)) return [];
  if (getUrlAll(registration, SOLID.forClass).includes(SM.Instance)) return [];
  return registeredOf(registration, dataClass, container);
}

/**
 * Take out of a type index document (see changeIndex) what each
 * registration registers of the instance's data (`registered`): the
 * registration whole when it registers nothing else (withoutRegistered).
 * Saves only when something was removed. The registrations changed are
 * set in one edit and those removed taken out in one (setThings,
 * removeThings), so many take time that grows with them, not their
 * square.
 */
async function removeRegistered(
  indexUrl: string,
  fetch: Fetch,
  registered: (registration: Subject) => string[],
): Promise<void> {
  await changeIndex(indexUrl, fetch, (dataset) => {
    // Every registration changed set at once, and every one removed taken out at once.
    const changed: Subject[] = [];
    const removed: Subject[] = [];
    for (const thing of getThingAll(dataset)) {
      const ours = registered(thing);
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
 * leads to (ownStorages): the one `url` is in, or else the first.
 * Throws when the WebID leads to none.
 */
async function ownStorageFor(url: string, webId: string, fetch: Fetch): Promise<string> {
  const storages = await ownStorages(webId, fetch);
  const storage = storages.find((root) => url.startsWith(root)) ?? storages[0];
  if (storage === undefined) throw new AppError("typeIndexNoStorage", { webId });
  return storage;
}

/**
 * The user's own storages, those their WebID leads to
 * (discoverStorages: pim:storage in their profile, or else the one the
 * WebID's own address is in), each a folder's address.
 */
async function ownStorages(webId: string, fetch: Fetch): Promise<string[]> {
  return (
    await createSolidStorageGateway({
      fetch,
      profileStorages: getProfileStorages,
    }).discoverStorages(webId)
  ).map((storage) => ensureTrailingSlash(storage.url));
}
