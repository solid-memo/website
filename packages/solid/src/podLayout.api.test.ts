// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { expect, it } from "vitest";
import { monthOfStudyDay } from "@solid-memo/domain/answer";
import type { RegistrationTarget } from "@solid-memo/domain/instance";
import {
  catalogNodeUrlOf,
  catalogUrlOf,
  digestUrlOf,
  historyUrlOf,
  paletteUrlOf,
} from "@solid-memo/domain/instanceLayout";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import {
  cardsDocumentOf,
  chapterDocumentOf,
  draftUrlOf,
} from "@solid-memo/domain/release/draftLayout";
import { releasesContainerOf, releaseUrlIn } from "@solid-memo/domain/release/releasePlace";
import { createSolidInstanceRepository } from "./solidInstanceRepository";
import { createSolidPaletteRepository } from "./solidPaletteRepository";
import { createSolidPreferencesRepository } from "./solidPreferencesRepository";
import { createSolidStorageGateway } from "./solidStorageGateway";
import { fakePod } from "./testing/fakePod";
import { locateTypeIndexes } from "./typeIndex";

const STORAGE = "https://pod.example/";
const INSTANCE = `${STORAGE}solid-memo/main/`;
const PROFILE = `${STORAGE}profile/card`;
const WEBID = `${PROFILE}#me`;
const PRIVATE_INDEX = `${STORAGE}settings/privateTypeIndex.ttl`;
const PUBLIC_INDEX = `${STORAGE}settings/publicTypeIndex.ttl`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const DCTERMS_TITLE = "http://purl.org/dc/terms/title";

/**
 * Prefixes the lines name terms by. They are written out here, not
 * taken from the code's vocabularies, so a term that moves to another
 * namespace changes its line.
 */
const PREFIXES: Record<string, string> = {
  dcat: "http://www.w3.org/ns/dcat#",
  sm: "https://solid-memo.com/ns/vocab/v1.ttl#",
  solid: "http://www.w3.org/ns/solid/terms#",
};

/** A term or URL as a line names it: by prefix, or relative to the example instance. */
function named(iri: string): string {
  for (const [prefix, namespace] of Object.entries(PREFIXES)) {
    if (iri.startsWith(namespace)) return `${prefix}:${iri.slice(namespace.length)}`;
  }
  return iri.startsWith(INSTANCE) ? `<instance>${iri.slice(INSTANCE.length)}` : `<${iri}>`;
}

/** A pod for the examples, which a WebID with its fragment reads as the WebID document. */
function examplePod() {
  const pod = fakePod();
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    pod.fetch(String(input).split("#")[0]!, init)) as typeof globalThis.fetch;
  return { ...pod, fetch };
}

/** The statements of a document of the pod, as subject, predicate and object. */
function statements(pod: ReturnType<typeof examplePod>, url: string): string[][] {
  return (pod.triples(url) ?? []).map((line) => {
    const [, subject, predicate, object] = /^<([^>]*)> <([^>]*)> (.*) \.$/.exec(line)!;
    return [subject, predicate, object.replace(/^<(.*)>$/, "$1").replace(/^"(.*)"$/, "$1")];
  });
}

/** The subjects of a document of the pod that are of a class. */
function subjectsOf(pod: ReturnType<typeof examplePod>, url: string, type: string): string[] {
  return statements(pod, url)
    .filter(([, predicate, object]) => predicate === RDF_TYPE && object === type)
    .map(([subject]) => subject);
}

/** A pod whose WebID document links both type indexes, which are empty. */
async function podWithIndexes() {
  const pod = examplePod();
  await pod.put(
    PROFILE,
    `<#me> <${PREFIXES.solid}privateTypeIndex> <${PRIVATE_INDEX}> ; <${PREFIXES.solid}publicTypeIndex> <${PUBLIC_INDEX}> .`,
  );
  await pod.put(PRIVATE_INDEX, "");
  await pod.put(PUBLIC_INDEX, "");
  return pod;
}

/** The registrations an instance gets when it is made, registered in the private or the public type index. */
async function registrationLines(target: RegistrationTarget): Promise<string[]> {
  const pod = await podWithIndexes();
  let id = 0;
  await createSolidInstanceRepository({
    fetch: pod.fetch,
    now: () => new Date("2026-10-15T00:00:00Z"),
    randomId: () => `r${++id}`,
  }).createInstance({
    webId: WEBID,
    containerUrl: INSTANCE,
    name: "Study",
    registrationTarget: target,
  });
  const indexes: [string, string][] = [
    ["private", PRIVATE_INDEX],
    ["public", PUBLIC_INDEX],
  ];
  return indexes.flatMap(([kind, indexUrl]) => {
    const all = statements(pod, indexUrl);
    return subjectsOf(pod, indexUrl, `${PREFIXES.solid}TypeRegistration`).flatMap(
      (registration) => {
        const of = (predicate: string) =>
          all.filter(([s, p]) => s === registration && p === predicate).map(([, , o]) => o);
        const titled = of(DCTERMS_TITLE).includes("Study")
          ? ", titled with the instance's name"
          : "";
        return of(`${PREFIXES.solid}forClass`).flatMap((forClass) =>
          ["instance", "instanceContainer"].flatMap((predicate) =>
            of(`${PREFIXES.solid}${predicate}`).map(
              (registered) =>
                `instance registered in the ${target} index: the ${kind} type index registers ${named(forClass)} at solid:${predicate} ${named(registered)}${titled}`,
            ),
          ),
        );
      },
    );
  });
}

/** The registrations by which this app finds an instance: one for sm:Instance, in either type index, naming the container by either predicate. */
async function instanceDiscoveryLines(): Promise<string[]> {
  const lines: string[] = [];
  const indexes: [string, string][] = [
    ["private", PRIVATE_INDEX],
    ["public", PUBLIC_INDEX],
  ];
  for (const [kind, indexUrl] of indexes) {
    for (const predicate of ["instance", "instanceContainer"]) {
      const pod = await podWithIndexes();
      await pod.put(
        indexUrl,
        `<#r> a <${PREFIXES.solid}TypeRegistration> ; <${PREFIXES.solid}forClass> <${PREFIXES.sm}Instance> ; <${PREFIXES.solid}${predicate}> <${INSTANCE}> .`,
      );
      const found = await createSolidInstanceRepository({
        fetch: pod.fetch,
        now: () => new Date(),
        randomId: () => "r",
      }).listInstances(WEBID);
      if (found.some((instance) => instance.url === INSTANCE))
        lines.push(
          `instances: found by a sm:Instance registration at solid:${predicate} in the ${kind} type index`,
        );
    }
  }
  return lines;
}

/** Where an instance keeps its description, from the documents its creation writes. */
async function metaLines(): Promise<string[]> {
  const pod = await podWithIndexes();
  await createSolidInstanceRepository({
    fetch: pod.fetch,
    now: () => new Date("2026-10-15T00:00:00Z"),
    randomId: () => "r",
  }).createInstance({
    webId: WEBID,
    containerUrl: INSTANCE,
    name: "Study",
    registrationTarget: "private",
  });
  return subjectsOf(pod, `${INSTANCE}meta.ttl`, `${PREFIXES.sm}Instance`).map(
    (subject) => `instance: described by ${named(subject)}, a sm:Instance`,
  );
}

/** Where an instance keeps its preferences, from what saving them writes. */
async function preferencesLines(): Promise<string[]> {
  const pod = examplePod();
  await createSolidPreferencesRepository({ fetch: pod.fetch }).savePreferences(
    INSTANCE,
    DEFAULT_PREFERENCES,
  );
  return subjectsOf(pod, `${INSTANCE}preferences.ttl`, `${PREFIXES.sm}Preferences`).map(
    (subject) => `preferences: kept in ${named(subject)}, a sm:Preferences`,
  );
}

/** Where an instance keeps the palettes the user designed, from what saving one writes. */
async function paletteLines(): Promise<string[]> {
  const pod = examplePod();
  await createSolidPaletteRepository({ fetch: pod.fetch }).savePalette(INSTANCE, {
    url: paletteUrlOf(INSTANCE, "id"),
    title: { en: "Mine" },
    basedOn: "standard",
    light: {},
    dark: {},
  });
  const document = `${INSTANCE}palettes.ttl`;
  // Each palette's own id.
  const shown = (subject: string) => named(subject).replace("#palette-id", "#palette-<id>");
  return [
    ...subjectsOf(pod, document, `${PREFIXES.sm}Palette`).map(
      (subject) => `palettes: each kept in ${shown(subject)}, a sm:Palette`,
    ),
    ...subjectsOf(pod, document, `${PREFIXES.sm}ColorSet`).map(
      (subject) => `palettes: its colors in ${shown(subject)}, a sm:ColorSet`,
    ),
  ];
}

/** The ways from a WebID to its type indexes that are followed: a link in each place a profile may keep it. */
async function typeIndexLinkLines(): Promise<string[]> {
  const elsewhere = `${STORAGE}profile/extended`;
  const places: { place: string; profile: string; elsewhere?: string }[] = [
    { place: "the WebID document", profile: "<#me> <LINK> <INDEX> ." },
    {
      place: "a document the WebID names by rdfs:seeAlso",
      profile: `<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${elsewhere}> .`,
      elsewhere: `<${WEBID}> <LINK> <INDEX> .`,
    },
    {
      place: "a document the WebID names by foaf:isPrimaryTopicOf",
      profile: `<#me> <http://xmlns.com/foaf/0.1/isPrimaryTopicOf> <${elsewhere}> .`,
      elsewhere: `<${WEBID}> <LINK> <INDEX> .`,
    },
    {
      place: "the document the WebID names by pim:preferencesFile",
      profile: `<#me> <http://www.w3.org/ns/pim/space#preferencesFile> <${elsewhere}> .`,
      elsewhere: `<${WEBID}> <LINK> <INDEX> .`,
    },
  ];
  const lines: string[] = [];
  for (const kind of ["private", "public"] as const) {
    const link = `${PREFIXES.solid}${kind}TypeIndex`;
    const index = kind === "private" ? PRIVATE_INDEX : PUBLIC_INDEX;
    for (const { place, profile, elsewhere: other } of places) {
      const pod = examplePod();
      const filled = (turtle: string) => turtle.replace("LINK", link).replace("INDEX", index);
      await pod.put(PROFILE, filled(profile));
      if (other !== undefined) await pod.put(elsewhere, filled(other));
      const found = await locateTypeIndexes(WEBID, pod.fetch);
      if ((kind === "private" ? found.privateIndexUrl : found.publicIndexUrl) === index)
        lines.push(`WebID: its ${kind} type index found by solid:${kind}TypeIndex in ${place}`);
    }
  }
  return lines;
}

/** The ways from a WebID to its storage that are followed: a link in each place a profile may keep it, else the Link header walk-up. */
async function storageLines(): Promise<string[]> {
  const elsewhere = `${STORAGE}profile/extended`;
  const link = `<${WEBID}> <http://www.w3.org/ns/pim/space#storage> <${STORAGE}> .`;
  const places: { place: string; profile: string; elsewhere?: string }[] = [
    { place: "the WebID document", profile: link },
    {
      place: "a document the WebID names by rdfs:seeAlso",
      profile: `<#me> <http://www.w3.org/2000/01/rdf-schema#seeAlso> <${elsewhere}> .`,
      elsewhere: link,
    },
    {
      place: "a document the WebID names by foaf:isPrimaryTopicOf",
      profile: `<#me> <http://xmlns.com/foaf/0.1/isPrimaryTopicOf> <${elsewhere}> .`,
      elsewhere: link,
    },
  ];
  const lines: string[] = [];
  for (const { place, profile, elsewhere: other } of places) {
    const pod = examplePod();
    await pod.put(PROFILE, profile);
    if (other !== undefined) await pod.put(elsewhere, other);
    const [found] = await createSolidStorageGateway({ fetch: pod.fetch }).discoverStorages(WEBID);
    if (found?.url === STORAGE && found.source === "profile")
      lines.push(`WebID: its storage found by pim:storage in ${place}`);
  }
  const walked = examplePod();
  await walked.put(PROFILE, "");
  // The storage root says it is one in a Link header, as the Solid Protocol has it.
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === STORAGE && init?.method === "HEAD"
      ? new Response(null, {
          headers: { Link: '<http://www.w3.org/ns/pim/space#Storage>; rel="type"' },
        })
      : walked.fetch(input, init)) as typeof globalThis.fetch;
  const [byLink] = await createSolidStorageGateway({ fetch }).discoverStorages(WEBID);
  if (byLink?.url === STORAGE && byLink.source === "linkHeader")
    lines.push(
      "WebID: its storage found by a Link rel=type pim:Storage header, walking up from the WebID",
    );
  return lines;
}

/**
 * Where this app keeps its data in the pod, part of its public API
 * (docs/releasing.md#the-public-api, docs/data-model.md): how it gets
 * from a WebID to the storage and the type indexes, the registrations an
 * instance's data has in them, and the names of the documents and
 * folders in an instance, relative to an example instance. A line that
 * goes, a document or folder moved or renamed, a registration changed
 * or a link no longer followed, is a breaking change, which
 * `npm run check:breaking` holds to a commit that says so.
 */
it("keeps api/pod-layout.txt to where the data is in the pod", async () => {
  const draft = draftUrlOf(INSTANCE, "solid", 2);
  const lines = [
    ...(await storageLines()),
    ...(await typeIndexLinkLines()),
    ...(await registrationLines("private")),
    ...(await registrationLines("public")),
    ...(await instanceDiscoveryLines()),
    ...(await metaLines()),
    ...(await preferencesLines()),
    ...(await paletteLines()),
    `catalog: the decks, the deck groups and the links to drafts and releases in ${named(catalogUrlOf(INSTANCE))}, the catalog subject ${named(catalogNodeUrlOf(INSTANCE))}`,
    `answer log: the answers of a study day in October 2026 in ${named(historyUrlOf(INSTANCE, monthOfStudyDay("2026-10-15")))}`,
    `digest: kept in ${named(digestUrlOf(INSTANCE))}`,
    `draft: version 2 of the draft "solid" in ${named(draft)}`,
    `draft: its chapter "intro" in ${named(chapterDocumentOf(draft, "intro"))}`,
    `draft: the cards no chapter asks in ${named(cardsDocumentOf(draft))}`,
    `release: version 2 of the release "solid" published from an instance in ${named(releaseUrlIn(releasesContainerOf(INSTANCE), "solid", 2))}`,
  ];
  await expect(`${lines.sort().join("\n")}\n`).toMatchFileSnapshot("../../../api/pod-layout.txt");
});
