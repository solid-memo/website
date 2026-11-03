// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Page } from "@playwright/test";

/**
 * Documents a journey writes to a pod itself, with plain requests, as
 * Solid Memo would have written them, and answers of the server a
 * journey changes: what pod-safety.journey.ts and the errors tour
 * (tour-errors.journey.ts) set up the app to meet.
 */

export const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
export const PREFIXES = `@prefix sm: <${SM}> .
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <https://schema.org/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix acl: <http://www.w3.org/ns/auth/acl#> .
`;
export const CREATED = `"2026-10-01T00:00:00.000Z"^^xsd:dateTime`;

/** Whoever writes the documents: a user of the Solid server, or another app. */
export interface Writer {
  /** Writes the document at `url`, made or replaced. */
  put(url: string, body: string, contentType: string): Promise<void>;
}

/** The instance's `meta.ttl`, as Solid Memo writes it. */
export function metaOf(name: string): string {
  return `${PREFIXES}<#it> a sm:Instance ; dcterms:title "${name}" ; dcterms:created ${CREATED} ; sm:formatVersion 2 .`;
}

export interface DeckEntry {
  id: string;
  title: string;
  cards: string;
  reviews: string;
}

/** A `catalog.ttl` of decks (their documents named as given) and drafts, as Solid Memo writes one. */
export function catalogOf(
  name: string,
  publisher: string,
  decks: readonly DeckEntry[],
  drafts: readonly string[] = [],
): string {
  const links = [
    ...decks.map((deck) => `dcat:dataset <#${deck.id}>`),
    ...drafts.map((draft) => `sm:releaseDraft <${draft}>`),
  ];
  const entries = decks.map(
    (deck) => `<#${deck.id}> a sm:Deck, dcat:Dataset ;
  dcterms:title "${deck.title}"@en ; dcterms:description "Flashcards: ${deck.title}."@en ;
  sm:formatVersion 6 ; dcterms:created ${CREATED} ; sm:studyDirection sm:frontToBack ;
  dcat:distribution <#${deck.id}-cards> ;
  sm:cardsDocument <${deck.cards}> ; sm:reviewsDocument <${deck.reviews}> .
<#${deck.id}-cards> a dcat:Distribution ; sm:formatVersion 1 ; dcat:accessURL <${deck.cards}> ;
  dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> .`,
  );
  return `${PREFIXES}<#catalog> a dcat:Catalog ; dcterms:title "${name}" ;
  dcterms:description "Flashcard decks of the Solid Memo instance ${name}." ;
  dcterms:publisher <${publisher}> ;
  dcat:themeTaxonomy <https://solid-memo.com/ns/vocab/topics.ttl>, <http://publications.europa.eu/resource/authority/data-theme> ;
  sm:formatVersion 1${links.map((link) => ` ;\n  ${link}`).join("")} .
<${publisher}> a foaf:Agent ; sm:formatVersion 1 ; foaf:name "${publisher}" .
${entries.join("\n")}
`;
}

/** A draft's `release.ttl`, a blank course, as Solid Memo writes one. */
function draftRelease(title: string): string {
  return `${PREFIXES}<> a sm:Deck, dcat:Dataset, schema:Course ; dcterms:title "${title}"@en ;
  dcterms:created ${CREATED} ; sm:studyDirection sm:frontToBack ;
  dcat:theme <http://publications.europa.eu/resource/authority/data-theme/EDUC> ;
  dcat:version "1" ; dcat:inSeries <#series> ; dcat:isVersionOf <#series> ;
  dcat:distribution <#turtle> ; sm:formatVersion 1 .
<#turtle> a dcat:Distribution ; dcat:accessURL <> ; dcat:downloadURL <> ;
  dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> ;
  dcterms:format <http://publications.europa.eu/resource/authority/file-type/RDF_TURTLE> ;
  sm:formatVersion 1 .
`;
}

/**
 * A draft, a course titled `title`, its `release.ttl` at `draft`, whose
 * chapter has an id no draft can have: one a chapter's document would
 * be named after outside the draft's folder, at `elsewhere`. The id.
 */
export async function writeDraftWithUnsupportedChapter(
  writer: Writer,
  draft: string,
  title: string,
  elsewhere: string,
): Promise<string> {
  const folder = draft.slice(0, draft.lastIndexOf("/") + 1);
  const steps = new URL(`${folder}chapter-a/`).pathname.split("/").length - 2;
  const id = `a/${"../".repeat(steps)}${new URL(elsewhere).pathname.slice(1)}`;
  await writer.put(draft, draftRelease(title), "text/turtle");
  await writer.put(
    `${folder}chapter-ch-pods.ttl`,
    `${PREFIXES}<#${id}> a sm:Chapter, schema:Syllabus ; dcterms:title "Pods"@en ;
  schema:isPartOf <release.ttl> ; schema:position 0 ; sm:formatVersion 1 .`,
    "text/turtle",
  );
  return id;
}

/**
 * Has the server name `accessControl` as the access control of every
 * release in a releases folder (its `Link: <…>; rel="acl"`), on reads:
 * an address elsewhere in the user's pod. How many answers named it.
 */
export async function nameAccessControl(
  page: Page,
  accessControl: string,
): Promise<{ count: number }> {
  const named = { count: 0 };
  await page.route(/\/releases\/[^/]+\/v\d+\.ttl$/, async (route) => {
    if (!["GET", "HEAD"].includes(route.request().method())) return route.fallback();
    const response = await route.fetch();
    const headers = response.headers();
    const link = headers.link ?? "";
    headers.link = link.replace(/<[^>]*>;\s*rel="acl"/, `<${accessControl}>; rel="acl"`);
    if (headers.link !== link) named.count += 1;
    await route.fulfill({ response, headers });
  });
  return named;
}
