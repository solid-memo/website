import {
  buildThing,
  createSolidDataset,
  createThing,
  getSourceUrl,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeThing,
  setThing,
  type SolidDataset,
  type Thing,
  type WithResourceInfo,
} from "@inrupt/solid-client";
import { getSolidDatasetOrNull, PreconditionFailedError, readDataset, saveDataset } from "./datasets";
import { ensureTrailingSlash } from "./urls";
import { DCAT, DCTERMS, FOAF, PIM, RDF, RDFS, SM, SOLID } from "./vocab";
import {
  candidateStorageUrls,
  hasStorageLink,
} from "./solidStorageGateway";
import { AppError } from "@solid-memo/domain/appError";
import { DATA_CLASSES, type DataClass } from "@solid-memo/domain/instance";
import {
  cardsContainerOf,
  catalogNodeUrlOf,
  catalogUrlOf,
  historyContainerOf,
  reviewsContainerOf,
} from "@solid-memo/domain/instanceLayout";
import { draftsContainerOf } from "@solid-memo/domain/release/draftLayout";

type Fetch = typeof globalThis.fetch;
export type TypeIndexKind = "private" | "public";

export interface TypeIndexLocations {
  privateIndexUrl: string | null;
  publicIndexUrl: string | null;
}

/**
 * Locate both type indexes for a WebID. Links are looked up on the WebID
 * subject in the WebID document and in any extended profile documents
 * (rdfs:seeAlso / foaf:isPrimaryTopicOf — e.g. Inrupt PodSpaces keeps a
 * read-only WebID document and a writable profile in the pod). The
 * private index is additionally looked up in the pim:preferencesFile
 * (per spec).
 */
export async function locateTypeIndexes(
  webId: string,
  fetch: Fetch,
): Promise<TypeIndexLocations> {
  const profileDataset = await readDataset(webId, fetch);
  const profile = getThing(profileDataset, webId);
  if (profile === null) {
    return { privateIndexUrl: null, publicIndexUrl: null };
  }

  let publicIndexUrl = getUrl(profile, SOLID.publicTypeIndex);
  let privateIndexUrl = getUrl(profile, SOLID.privateTypeIndex);

  for (const extendedProfileUrl of extendedProfileUrls(
    profile,
    profileDataset,
  )) {
    if (publicIndexUrl !== null && privateIndexUrl !== null) break;
    const subject = await readSubjectSafely(extendedProfileUrl, webId, fetch);
    if (subject === null) continue;
    publicIndexUrl ??= getUrl(subject, SOLID.publicTypeIndex);
    privateIndexUrl ??= getUrl(subject, SOLID.privateTypeIndex);
  }

  if (privateIndexUrl === null) {
    const preferencesFileUrl = getUrl(profile, PIM.preferencesFile);
    if (preferencesFileUrl !== null) {
      const subject = await readSubjectSafely(
        preferencesFileUrl,
        webId,
        fetch,
      );
      privateIndexUrl =
        subject === null ? null : getUrl(subject, SOLID.privateTypeIndex);
    }
  }

  return { privateIndexUrl, publicIndexUrl };
}

/**
 * Extended profile documents linked from the WebID subject, deduplicated
 * and excluding the WebID document itself (which is commonly its own
 * foaf:isPrimaryTopicOf).
 */
function extendedProfileUrls(
  profile: Thing,
  profileDataset: SolidDataset & WithResourceInfo,
): string[] {
  const self = new Set([
    stripFragment(profile.url),
    stripFragment(getSourceUrl(profileDataset)),
  ]);
  const urls = [
    ...getUrlAll(profile, RDFS.seeAlso),
    ...getUrlAll(profile, FOAF.isPrimaryTopicOf),
  ].map(stripFragment);
  return [...new Set(urls)].filter((url) => !self.has(url));
}

function stripFragment(url: string): string {
  return url.split("#")[0];
}

/** The WebID subject in a document, or null if unreadable or absent. */
async function readSubjectSafely(
  documentUrl: string,
  webId: string,
  fetch: Fetch,
): Promise<Thing | null> {
  try {
    const dataset = await readDataset(documentUrl, fetch);
    return getThing(dataset, webId);
  } catch {
    return null;
  }
}

/**
 * Create a type index document under <storage>settings/ and link it from
 * the profile. An index document already at that URL (e.g. left behind
 * by an earlier run whose profile link failed) is adopted as-is rather
 * than overwritten. Throws if either write fails.
 */
export async function createTypeIndex(
  kind: TypeIndexKind,
  webId: string,
  nearUrl: string,
  fetch: Fetch,
): Promise<string> {
  const storageRoot = await findStorageRoot(nearUrl, fetch);
  const indexUrl = `${storageRoot}settings/${kind}TypeIndex.ttl`;

  const existing = await getSolidDatasetOrNull(indexUrl, fetch);
  if (existing === null) {
    const indexDocument = setThing(
      createSolidDataset(),
      buildThing(createThing({ url: indexUrl }))
        .addIri(RDF.type, SOLID.TypeIndex)
        .addIri(
          RDF.type,
          kind === "public" ? SOLID.ListedDocument : SOLID.UnlistedDocument,
        )
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
  const profileDataset = await readDataset(webId, fetch);
  const profile = getThing(profileDataset, webId);
  if (profile === null) {
    throw new AppError("profileNoSubject", { webId });
  }
  const predicate =
    kind === "public" ? SOLID.publicTypeIndex : SOLID.privateTypeIndex;

  const failures: string[] = [];
  try {
    const updated = setThing(
      profileDataset,
      buildThing(profile).addIri(predicate, indexUrl).build(),
    );
    await saveDataset(getSourceUrl(profileDataset), updated, fetch);
    return;
  } catch (error) {
    failures.push(describeFailure(getSourceUrl(profileDataset), error));
  }

  for (const documentUrl of extendedProfileUrls(profile, profileDataset)) {
    try {
      const dataset = await readDataset(documentUrl, fetch);
      const subject =
        getThing(dataset, webId) ?? createThing({ url: webId });
      const updated = setThing(
        dataset,
        buildThing(subject).addIri(predicate, indexUrl).build(),
      );
      await saveDataset(documentUrl, updated, fetch);
      return;
    } catch (error) {
      failures.push(describeFailure(documentUrl, error));
    }
  }

  throw new AppError(kind === "private" ? "privateTypeIndexNotLinked" : "publicTypeIndexNotLinked", {
    index: indexUrl,
    failures: failures.map((failure) => `- ${failure}`).join("\n"),
  });
}

function describeFailure(documentUrl: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `<${documentUrl}>: ${message}`;
}

/** Find the target index, creating it (and its profile link) if missing. */
export async function ensureTypeIndex(
  kind: TypeIndexKind,
  webId: string,
  nearUrl: string,
  fetch: Fetch,
): Promise<string> {
  const locations = await locateTypeIndexes(webId, fetch);
  const existing =
    kind === "public" ? locations.publicIndexUrl : locations.privateIndexUrl;
  return existing ?? createTypeIndex(kind, webId, nearUrl, fetch);
}

export interface InstanceRegistration {
  containerUrl: string;
  title: string | null;
}

/** All sm:Instance registrations in a type index document. */
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
    const containerUrl =
      getUrl(thing, SOLID.instanceContainer) ?? getUrl(thing, SOLID.instance);
    if (containerUrl === null) continue;
    registrations.push({
      containerUrl,
      title: getStringNoLocale(thing, DCTERMS.title),
    });
  }
  return registrations;
}

/**
 * How each class of an instance's data is registered
 * (docs/data-model.md "Discovery chain"): the class, the predicate and
 * what it names, and the start of the registration's fragment id.
 * `solid:instance` names the one resource that holds the class's
 * subjects, `solid:instanceContainer` a container whose documents do.
 */
const DATA_CLASS_TARGETS: Record<
  DataClass,
  { forClass: string; predicate: string; target: (container: string) => string; idPrefix: string }
> = {
  instance: { forClass: SM.Instance, predicate: SOLID.instanceContainer, target: (container) => container, idPrefix: "sm-inst" },
  catalog: { forClass: DCAT.Catalog, predicate: SOLID.instance, target: catalogNodeUrlOf, idPrefix: "sm-cat" },
  deck: { forClass: SM.Deck, predicate: SOLID.instance, target: catalogUrlOf, idPrefix: "sm-deck" },
  card: { forClass: SM.Card, predicate: SOLID.instanceContainer, target: cardsContainerOf, idPrefix: "sm-card" },
  reviewState: { forClass: SM.ReviewState, predicate: SOLID.instanceContainer, target: reviewsContainerOf, idPrefix: "sm-review" },
  answer: { forClass: SM.Answer, predicate: SOLID.instanceContainer, target: historyContainerOf, idPrefix: "sm-answer" },
  // A draft's release document is an sm:Deck too: the drafts are told from the decks by where they are.
  draft: { forClass: SM.Deck, predicate: SOLID.instanceContainer, target: draftsContainerOf, idPrefix: "sm-draft" },
};

/**
 * What a registration registers of the instance's data of one class,
 * under either predicate: the instance's container, a missing trailing
 * slash ignored, as reading does; every other class's resource by its
 * exact IRI, so a resource anywhere else below the container, another
 * app's, is never taken for the instance's.
 */
function registeredOf(registration: Thing, dataClass: DataClass, container: string): string[] {
  const { forClass, target } = DATA_CLASS_TARGETS[dataClass];
  if (!getUrlAll(registration, RDF.type).includes(SOLID.TypeRegistration)) return [];
  if (!getUrlAll(registration, SOLID.forClass).includes(forClass)) return [];
  const ours = target(container);
  const matches =
    dataClass === "instance" ? (url: string) => ensureTrailingSlash(url) === ours : (url: string) => url === ours;
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
  change: (dataset: SolidDataset & WithResourceInfo) => { dataset: SolidDataset; result: R },
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

/** Which classes of the instance's data a type index document registers. */
export async function readRegisteredClasses(indexUrl: string, instanceUrl: string, fetch: Fetch): Promise<DataClass[]> {
  const container = ensureTrailingSlash(instanceUrl);
  const things = getThingAll(await readDataset(indexUrl, fetch));
  return DATA_CLASSES.filter((dataClass) => things.some((thing) => registeredOf(thing, dataClass, container).length > 0));
}

/**
 * Register the instance's data of each class given in a type index
 * document, each a solid:TypeRegistration titled with the instance's
 * name, in one save (see changeIndex); a class the index already
 * registers (the same class, naming the same resource) is not added
 * again. The classes added.
 */
export async function addRegistrations(
  indexUrl: string,
  { instanceUrl, title, classes }: { instanceUrl: string; title: string; classes: readonly DataClass[] },
  newId: () => string,
  fetch: Fetch,
): Promise<DataClass[]> {
  const container = ensureTrailingSlash(instanceUrl);
  return changeIndex(indexUrl, fetch, (dataset) => {
    const things = getThingAll(dataset);
    const missing = classes.filter(
      (dataClass) => !things.some((thing) => registeredOf(thing, dataClass, container).length > 0),
    );
    const updated = missing.reduce<SolidDataset>((current, dataClass) => {
      const { forClass, predicate, target, idPrefix } = DATA_CLASS_TARGETS[dataClass];
      return setThing(
        current,
        buildThing(createThing({ url: `${indexUrl}#${idPrefix}-${newId()}` }))
          .addIri(RDF.type, SOLID.TypeRegistration)
          .addIri(SOLID.forClass, forClass)
          .addIri(predicate, target(container))
          .addStringNoLocale(DCTERMS.title, title)
          .build(),
      );
    }, dataset);
    return { dataset: updated, result: missing };
  });
}

/**
 * Remove every registration of an instance's data from a type index
 * document (see changeIndex), by what each class's registration names
 * (registeredOf): the container for its sm:Instance registration, and
 * for the others exactly the instance's catalogue
 * (`<container>catalog.ttl#catalog`), catalog document, `decks/`,
 * `reviews/` and `history/`, never anything else below the container,
 * which may be another app's. A registration that names something else
 * besides keeps it, and loses only the links to the instance's data.
 * Saves only when something was removed.
 */
export async function removeInstanceRegistrations(
  indexUrl: string,
  containerUrl: string,
  fetch: Fetch,
): Promise<void> {
  const container = ensureTrailingSlash(containerUrl);
  await changeIndex(indexUrl, fetch, (dataset) => {
    let updated: SolidDataset = dataset;
    for (const thing of getThingAll(dataset)) {
      const ours = DATA_CLASSES.flatMap((dataClass) => registeredOf(thing, dataClass, container));
      updated = withoutRegistered(updated, thing, ours);
    }
    return { dataset: updated, result: undefined };
  });
}

/** What a registration registers, under either predicate. */
function registeredUrls(registration: Thing): string[] {
  return [...getUrlAll(registration, SOLID.instanceContainer), ...getUrlAll(registration, SOLID.instance)];
}

/** The index without the registration's links to `urls`: the whole registration when it registers nothing else. */
function withoutRegistered(dataset: SolidDataset, registration: Thing, urls: readonly string[]): SolidDataset {
  if (urls.length === 0) return dataset;
  if (registeredUrls(registration).every((url) => urls.includes(url))) return removeThing(dataset, registration);
  const builder = urls.reduce(
    (current, url) => current.removeUrl(SOLID.instanceContainer, url).removeUrl(SOLID.instance, url),
    buildThing(registration),
  );
  return setThing(dataset, builder.build());
}

/**
 * Give every registration of an instance's data in a type index document
 * a new title (dcterms:title), in one save (see changeIndex): each
 * class's registration, by what it names (registeredOf). Saves nothing
 * when no registration needs the title.
 */
export async function renameInstanceRegistrations(
  indexUrl: string,
  { containerUrl, title }: { containerUrl: string; title: string },
  fetch: Fetch,
): Promise<void> {
  const container = ensureTrailingSlash(containerUrl);
  await changeIndex(indexUrl, fetch, (dataset) => {
    let updated: SolidDataset = dataset;
    for (const thing of getThingAll(dataset)) {
      const ours = DATA_CLASSES.some((dataClass) => registeredOf(thing, dataClass, container).length > 0);
      if (ours && getStringNoLocale(thing, DCTERMS.title) !== title) {
        updated = setThing(updated, buildThing(thing).setStringNoLocale(DCTERMS.title, title).build());
      }
    }
    return { dataset: updated, result: undefined };
  });
}

/**
 * Storage root for a resource per the Solid Protocol Link-header walk-up,
 * falling back to the origin root when no candidate advertises one.
 */
async function findStorageRoot(
  resourceUrl: string,
  fetch: Fetch,
): Promise<string> {
  const candidates = candidateStorageUrls(resourceUrl);
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, { method: "HEAD" });
      if (hasStorageLink(response.headers.get("Link"))) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return new URL("/", resourceUrl).toString();
}
