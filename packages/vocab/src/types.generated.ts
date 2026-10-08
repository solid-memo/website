/* Generated from ns/shapes/<class>/v<N>.ttl by `npm run generate`. Do not edit: change the source and regenerate. */

/**
 * A text in one or more languages (rdf:langString values): language tag,
 * lower case ("en", "sv", "en-gb"), to the text in that language.
 * Where a shape also allows untagged text (a card's sides), the empty tag
 * ("") holds it.
 */
export type LangText = Readonly<Record<string, string>>;

/**
 * Several texts per language (rdf:langString values without
 * sh:uniqueLang, such as a deck's keywords): language tag, lower case, to
 * the texts in that language, in stored order. Where a shape also allows
 * untagged text, the empty tag ("") holds it; {} is none.
 */
export type LangTexts = Readonly<Record<string, readonly string[]>>;

/** The record kinds the shapes describe (see docs/shapes.md). */
export type ShapeName = "agent" | "answer" | "card" | "catalog" | "chapter" | "deck" | "deckGroup" | "deckSchedule" | "distractor" | "distribution" | "documentReceipt" | "instance" | "libraryDeck" | "libraryDeckSeries" | "preferences" | "reviewState" | "step";

/** The shape version this app writes for each kind. */
export const LATEST_VERSION = {
  agent: 1,
  answer: 1,
  card: 5,
  catalog: 1,
  chapter: 1,
  deck: 6,
  deckGroup: 1,
  deckSchedule: 1,
  distractor: 1,
  distribution: 1,
  documentReceipt: 1,
  instance: 2,
  libraryDeck: 5,
  libraryDeckSeries: 3,
  preferences: 4,
  reviewState: 2,
  step: 1,
} as const;

/** A creator or publisher: a foaf:Agent with a name. */
export interface AgentV1 {
  readonly name: string;
  readonly mbox?: string;
}

/** Answer format 1: the deck and card answered, the way it was asked, the SM-2 grade, when it was given and the study day it counts towards, and the prompt's interval before (absent on its first answer) and after; since vocabulary 1.14, without a format bump, how it was answered (absent: recalled) and, for a wrong multiple-choice answer, the wrong option chosen. */
export interface AnswerV1 {
  readonly deck: string;
  readonly card: string;
  readonly direction: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront";
  readonly grade: number;
  readonly answeredAt: string;
  readonly studyDay: string;
  readonly priorIntervalDays?: number;
  readonly nextIntervalDays: number;
  readonly mode?: "https://solid-memo.com/ns/vocab/v1.ttl#recall" | "https://solid-memo.com/ns/vocab/v1.ttl#multipleChoice";
  readonly chosenDistractor?: string;
}

/** Card format 1: front and back text, both required. */
export interface CardV1 {
  readonly front: string;
  readonly back: string;
  readonly created?: string;
}

/** Card format 2: each side has text, a picture or both; a picture is always an IRI. */
export interface CardV2 {
  readonly front?: string;
  readonly back?: string;
  readonly frontImage?: string;
  readonly backImage?: string;
  readonly created?: string;
}

/** Card format 3: each side has text, a picture or both (a picture is always an IRI); each side may have a note under it, shown once the answer is revealed, and the back a label above it that says how the answer relates to the front, all three language-tagged text with an English value; a retired card, which is kept but no longer studied, states owl:deprecated true. */
export interface CardV3 {
  readonly front?: string;
  readonly back?: string;
  readonly frontImage?: string;
  readonly backImage?: string;
  readonly frontNote?: LangText;
  readonly backLabel?: LangText;
  readonly backNote?: LangText;
  readonly created?: string;
  readonly deprecated?: boolean;
}

/** Card format 4: each side has text, a picture or both (a picture is always an IRI); a side's text is untagged, its language unknown, or language-tagged, one text per language; a side's picture may have a description, its text alternative, language-tagged text, one per language (added without a version bump: an older reader ignores it); each side may have a note under it, shown once the answer is revealed, and the back a label above it that says how the answer relates to the front, all three language-tagged text with an English value; a retired card, which is kept but no longer studied, states owl:deprecated true. */
export interface CardV4 {
  readonly front?: LangText;
  readonly back?: LangText;
  readonly frontImage?: string;
  readonly backImage?: string;
  readonly frontImageDescription?: LangText;
  readonly backImageDescription?: LangText;
  readonly frontNote?: LangText;
  readonly backLabel?: LangText;
  readonly backNote?: LangText;
  readonly created?: string;
  readonly deprecated?: boolean;
}

/** Card format 5: each side has text, a picture or both (a picture is always an IRI); a side's text is untagged, its language unknown, or language-tagged, one text per language; a side's picture may have a description, its text alternative, language-tagged text, one per language; each side may have a note under it, shown once the answer is revealed, and the back a label above it that says how the answer relates to the front, all three language-tagged text in any language, one per language; a retired card, which is kept but no longer studied, states owl:deprecated true; a card asked as a multiple-choice question names its wrong options, distractors of the same document (since vocabulary 1.14, without a format bump); a card may say how its texts are written, solid-memo:textFormat, plain or Markdown (since vocabulary 1.15, without a format bump). */
export interface CardV5 {
  readonly front?: LangText;
  readonly back?: LangText;
  readonly frontImage?: string;
  readonly backImage?: string;
  readonly frontImageDescription?: LangText;
  readonly backImageDescription?: LangText;
  readonly frontNote?: LangText;
  readonly backLabel?: LangText;
  readonly backNote?: LangText;
  readonly created?: string;
  readonly deprecated?: boolean;
  readonly distractor: readonly string[];
  readonly textFormat?: string;
}

/** A catalogue of decks: a dcat:Catalog. */
export interface CatalogV1 {
  readonly title: string;
  readonly description: string;
  readonly publisher: string;
  readonly license?: string;
  readonly modified?: string;
  readonly themeTaxonomy: readonly string[];
  readonly dataset: readonly string[];
}

/** Chapter format 1: a schema:Syllabus of a course release, part of it at its place among its chapters, with a language-tagged title, one of them English, and description, the cards asked only in its final review, and owl:deprecated true once retired; a chapter may say how its description is written, solid-memo:textFormat, plain or Markdown (since vocabulary 1.15, without a format bump). */
export interface ChapterV1 {
  readonly title: LangText;
  readonly description?: LangText;
  readonly course: string;
  readonly position: number;
  readonly reviewQuestion: readonly string[];
  readonly deprecated?: boolean;
  readonly textFormat?: string;
}

/** Deck format 1 as a catalog entry in a pod. */
export interface DeckV1 {
  readonly title: string;
  readonly created?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly description?: string;
  readonly cardsDocument: string;
  readonly reviewsDocument: string;
  readonly source?: string;
}

/** Deck format 2 as a catalog entry in a pod. */
export interface DeckV2 {
  readonly title: string;
  readonly created?: string;
  readonly modified?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly description?: string;
  readonly direction: "front-to-back" | "back-to-front" | "bidirectional";
  readonly cardsDocument: string;
  readonly reviewsDocument: string;
  readonly source?: string;
}

/** Deck format 3 as a catalog entry in a pod: a dcat:Dataset. */
export interface DeckV3 {
  readonly title: string;
  readonly description: string;
  readonly created?: string;
  readonly modified?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly theme: readonly string[];
  readonly keyword: readonly string[];
  readonly distribution: readonly string[];
  readonly cardsDocument: string;
  readonly reviewsDocument: string;
  readonly source?: string;
  readonly newCardsPerDay?: number;
  readonly maxReviewsPerDay?: number;
}

/** Deck format 4 as a catalog entry in a pod: a dcat:Dataset. */
export interface DeckV4 {
  readonly title: LangText;
  readonly description: LangText;
  readonly created?: string;
  readonly modified?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly theme: readonly string[];
  readonly keyword: readonly string[];
  readonly distribution: readonly string[];
  readonly cardsDocument: string;
  readonly reviewsDocument: string;
  readonly source?: string;
  readonly newCardsPerDay?: number;
  readonly maxReviewsPerDay?: number;
}

/** Deck format 5 as a catalog entry in a pod: a dcat:Dataset. */
export interface DeckV5 {
  readonly title: LangText;
  readonly description: LangText;
  readonly created?: string;
  readonly modified?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly theme: readonly string[];
  readonly keyword: readonly string[];
  readonly distribution: readonly string[];
  readonly cardsDocument: string;
  readonly reviewsDocument: string;
  readonly source?: string;
  readonly newCardsPerDay?: number;
  readonly maxReviewsPerDay?: number;
}

/** Deck format 6 as a catalog entry in a pod: a dcat:Dataset whose keywords are language-tagged, several per language. */
export interface DeckV6 {
  readonly title: LangText;
  readonly description: LangText;
  readonly created?: string;
  readonly modified?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly theme: readonly string[];
  readonly keyword: LangTexts;
  readonly distribution: readonly string[];
  readonly cardsDocument: string;
  readonly reviewsDocument: string;
  readonly source?: string;
  readonly newCardsPerDay?: number;
  readonly maxReviewsPerDay?: number;
}

/** Deck group format 1: a dcat:Catalog of decks and deck groups, with a language-tagged name and description, the catalogue's publisher, and its place among its parent's members. */
export interface DeckGroupV1 {
  readonly title: LangText;
  readonly description: LangText;
  readonly publisher: string;
  readonly dataset: readonly string[];
  readonly catalog: readonly string[];
  readonly position?: number;
}

/** Deck schedule format 1: the deck, the versions of its two documents it was computed from, the direction and day boundary it was computed with, the study day it was computed on, the prompts due by day, the new ones, and that day's reviews and introductions. */
export interface DeckScheduleV1 {
  readonly deck: string;
  readonly cardsVersion: string;
  readonly reviewsVersion: string;
  readonly direction: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly dayBoundaryHour: number;
  readonly studyDay: string;
  readonly dueOnDay: readonly string[];
  readonly unreviewed: number;
  readonly reviewedOnDay: number;
  readonly introducedOnDay: number;
}

/** Distractor format 1: a schema:Answer, a wrong option of a card, its text untagged, its language unknown, or language-tagged, one per language, never both, and a note on why it is wrong, language-tagged, one per language. */
export interface DistractorV1 {
  readonly text: LangText;
  readonly note?: LangText;
  readonly deprecated?: boolean;
}

/** A deck's cards as a file: a dcat:Distribution. */
export interface DistributionV1 {
  readonly accessUrl: string;
  readonly downloadUrl?: string;
  readonly mediaType?: string;
  readonly format?: string;
}

/** Document receipt format 1: the document and its version; that it conformed to the shapes (under named rules), and that nothing in it was in an older format, each when so. */
export interface DocumentReceiptV1 {
  readonly document: string;
  readonly version: string;
  readonly conformedTo?: string;
  readonly latestFormat?: boolean;
}

/** Instance format 1: a title and a creation time. */
export interface InstanceV1 {
  readonly title: string;
  readonly created: string;
}

/** Instance format 2: a title, a creation time and, for an updated copy, the instance it replaces. */
export interface InstanceV2 {
  readonly title: string;
  readonly created: string;
  readonly replaces?: string;
  readonly modified?: string;
}

/** Deck format 1 as a deck-library document. */
export interface LibraryDeckV1 {
  readonly title: string;
  readonly created?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly description?: string;
  readonly source: readonly string[];
}

/** Deck format 2 as a deck-library document. */
export interface LibraryDeckV2 {
  readonly title: string;
  readonly created?: string;
  readonly modified?: string;
  readonly creator: readonly string[];
  readonly license?: string;
  readonly description?: string;
  readonly direction: "front-to-back" | "back-to-front" | "bidirectional";
  readonly source: readonly string[];
}

/** Deck format 3 as a deck-library document: one release of a deck, a dcat:Dataset in the deck's series. */
export interface LibraryDeckV3 {
  readonly title: string;
  readonly description: string;
  readonly created?: string;
  readonly modified?: string;
  readonly issued?: string;
  readonly creator: readonly string[];
  readonly publisher: string;
  readonly license?: string;
  readonly studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly theme: readonly string[];
  readonly keyword: readonly string[];
  readonly language: readonly string[];
  readonly version: string;
  readonly versionNotes?: string;
  readonly inSeries: string;
  readonly isVersionOf: string;
  readonly prev?: string;
  readonly previousVersion?: string;
  readonly distribution: readonly string[];
  readonly wasDerivedFrom: readonly string[];
}

/** Deck format 4 as a deck-library document: one release of a deck, a dcat:Dataset in the deck's series. */
export interface LibraryDeckV4 {
  readonly title: LangText;
  readonly description: LangText;
  readonly created?: string;
  readonly modified?: string;
  readonly issued?: string;
  readonly creator: readonly string[];
  readonly publisher: string;
  readonly license?: string;
  readonly studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly theme: readonly string[];
  readonly keyword: readonly string[];
  readonly language: readonly string[];
  readonly version: string;
  readonly versionNotes?: string;
  readonly inSeries: string;
  readonly isVersionOf: string;
  readonly prev?: string;
  readonly previousVersion?: string;
  readonly distribution: readonly string[];
  readonly wasDerivedFrom: readonly string[];
}

/** Library deck format 5: one release of a deck, a dcat:Dataset in the deck's series, whose keywords are language-tagged, several per language. */
export interface LibraryDeckV5 {
  readonly title: LangText;
  readonly description: LangText;
  readonly created?: string;
  readonly modified?: string;
  readonly issued?: string;
  readonly creator: readonly string[];
  readonly publisher: string;
  readonly license?: string;
  readonly studyDirection: "https://solid-memo.com/ns/vocab/v1.ttl#frontToBack" | "https://solid-memo.com/ns/vocab/v1.ttl#backToFront" | "https://solid-memo.com/ns/vocab/v1.ttl#bidirectional";
  readonly theme: readonly string[];
  readonly keyword: LangTexts;
  readonly language: readonly string[];
  readonly version: string;
  readonly versionNotes?: string;
  readonly inSeries: string;
  readonly isVersionOf: string;
  readonly prev?: string;
  readonly previousVersion?: string;
  readonly distribution: readonly string[];
  readonly wasDerivedFrom: readonly string[];
}

/** A library deck across its releases: a dcat:DatasetSeries. */
export interface LibraryDeckSeriesV1 {
  readonly title: string;
  readonly description: string;
  readonly publisher: string;
  readonly theme: readonly string[];
  readonly keyword: readonly string[];
  readonly first: string;
  readonly last: string;
  readonly hasVersion: readonly string[];
  readonly hasCurrentVersion: string;
}

/** A library deck across its releases: a dcat:DatasetSeries. */
export interface LibraryDeckSeriesV2 {
  readonly title: LangText;
  readonly description: LangText;
  readonly publisher: string;
  readonly theme: readonly string[];
  readonly keyword: readonly string[];
  readonly first: string;
  readonly last: string;
  readonly hasVersion: readonly string[];
  readonly hasCurrentVersion: string;
}

/** A library deck across its releases: a dcat:DatasetSeries. */
export interface LibraryDeckSeriesV3 {
  readonly title: LangText;
  readonly description: LangText;
  readonly publisher: string;
  readonly theme: readonly string[];
  readonly keyword: LangTexts;
  readonly first: string;
  readonly last: string;
  readonly hasVersion: readonly string[];
  readonly hasCurrentVersion: string;
}

/** Preferences format 1: every field optional. */
export interface PreferencesV1 {
  readonly newCardsPerDay?: number;
  readonly maxReviewsPerDay?: number;
  readonly dayBoundaryHour?: number;
  readonly answerScale?: "sm2" | "minimal";
  readonly developerMode?: boolean;
}

/** Preferences format 2: every field required. */
export interface PreferencesV2 {
  readonly newCardsPerDay: number;
  readonly maxReviewsPerDay: number;
  readonly dayBoundaryHour: number;
  readonly answerScale: "sm2" | "minimal";
  readonly developerMode: boolean;
}

/** Preferences format 3: every field required, the invalid data policy among them. */
export interface PreferencesV3 {
  readonly newCardsPerDay: number;
  readonly maxReviewsPerDay: number;
  readonly dayBoundaryHour: number;
  readonly answerScale: "sm2" | "minimal";
  readonly developerMode: boolean;
  readonly invalidDataPolicy: "https://solid-memo.com/ns/vocab/v1.ttl#blockInstance" | "https://solid-memo.com/ns/vocab/v1.ttl#blockSubject" | "https://solid-memo.com/ns/vocab/v1.ttl#warnOnly";
}

/** Preferences format 4: every field required, the theme among them. */
export interface PreferencesV4 {
  readonly newCardsPerDay: number;
  readonly maxReviewsPerDay: number;
  readonly dayBoundaryHour: number;
  readonly answerScale: "sm2" | "minimal";
  readonly developerMode: boolean;
  readonly invalidDataPolicy: "https://solid-memo.com/ns/vocab/v1.ttl#blockInstance" | "https://solid-memo.com/ns/vocab/v1.ttl#blockSubject" | "https://solid-memo.com/ns/vocab/v1.ttl#warnOnly";
  readonly theme: "https://solid-memo.com/ns/vocab/v1.ttl#systemTheme" | "https://solid-memo.com/ns/vocab/v1.ttl#lightTheme" | "https://solid-memo.com/ns/vocab/v1.ttl#darkTheme";
}

/** Review-state format 1: the SM-2 fields; the previous* snapshot is admitted. */
export interface ReviewStateV1 {
  readonly easeFactor: number;
  readonly intervalDays: number;
  readonly repetitions: number;
  readonly due: string;
  readonly firstReviewedAt: string;
  readonly lastReviewedAt: string;
  readonly previousEaseFactor?: number;
  readonly previousIntervalDays?: number;
  readonly previousRepetitions?: number;
  readonly previousDue?: string;
  readonly previousLastReviewedAt?: string;
}

/** Review-state format 2: SM-2 fields, an all-or-nothing previous* snapshot, per-direction subjects. */
export interface ReviewStateV2 {
  readonly easeFactor: number;
  readonly intervalDays: number;
  readonly repetitions: number;
  readonly due: string;
  readonly firstReviewedAt: string;
  readonly lastReviewedAt: string;
  readonly previousEaseFactor?: number;
  readonly previousIntervalDays?: number;
  readonly previousRepetitions?: number;
  readonly previousDue?: string;
  readonly previousLastReviewedAt?: string;
}

/** Step format 1: a schema:LearningResource of a course release, part of a chapter at its place among the chapter's steps, with a short theory in language-tagged text, one of them English, the cards that check it, and owl:deprecated true once retired; a step may say how its theory is written, solid-memo:textFormat, plain or Markdown (since vocabulary 1.15, without a format bump). */
export interface StepV1 {
  readonly theory: LangText;
  readonly checkedBy: readonly string[];
  readonly chapter: string;
  readonly position: number;
  readonly deprecated?: boolean;
  readonly textFormat?: string;
}

export type AgentRecord = { version: 1; data: AgentV1 };
export type AnswerRecord = { version: 1; data: AnswerV1 };
export type CardRecord = { version: 1; data: CardV1 } | { version: 2; data: CardV2 } | { version: 3; data: CardV3 } | { version: 4; data: CardV4 } | { version: 5; data: CardV5 };
export type CatalogRecord = { version: 1; data: CatalogV1 };
export type ChapterRecord = { version: 1; data: ChapterV1 };
export type DeckRecord = { version: 1; data: DeckV1 } | { version: 2; data: DeckV2 } | { version: 3; data: DeckV3 } | { version: 4; data: DeckV4 } | { version: 5; data: DeckV5 } | { version: 6; data: DeckV6 };
export type DeckGroupRecord = { version: 1; data: DeckGroupV1 };
export type DeckScheduleRecord = { version: 1; data: DeckScheduleV1 };
export type DistractorRecord = { version: 1; data: DistractorV1 };
export type DistributionRecord = { version: 1; data: DistributionV1 };
export type DocumentReceiptRecord = { version: 1; data: DocumentReceiptV1 };
export type InstanceRecord = { version: 1; data: InstanceV1 } | { version: 2; data: InstanceV2 };
export type LibraryDeckRecord = { version: 1; data: LibraryDeckV1 } | { version: 2; data: LibraryDeckV2 } | { version: 3; data: LibraryDeckV3 } | { version: 4; data: LibraryDeckV4 } | { version: 5; data: LibraryDeckV5 };
export type LibraryDeckSeriesRecord = { version: 1; data: LibraryDeckSeriesV1 } | { version: 2; data: LibraryDeckSeriesV2 } | { version: 3; data: LibraryDeckSeriesV3 };
export type PreferencesRecord = { version: 1; data: PreferencesV1 } | { version: 2; data: PreferencesV2 } | { version: 3; data: PreferencesV3 } | { version: 4; data: PreferencesV4 };
export type ReviewStateRecord = { version: 1; data: ReviewStateV1 } | { version: 2; data: ReviewStateV2 };
export type StepRecord = { version: 1; data: StepV1 };

/** A record of any version, by kind. */
export type VersionedRecord = {
  agent: AgentRecord;
  answer: AnswerRecord;
  card: CardRecord;
  catalog: CatalogRecord;
  chapter: ChapterRecord;
  deck: DeckRecord;
  deckGroup: DeckGroupRecord;
  deckSchedule: DeckScheduleRecord;
  distractor: DistractorRecord;
  distribution: DistributionRecord;
  documentReceipt: DocumentReceiptRecord;
  instance: InstanceRecord;
  libraryDeck: LibraryDeckRecord;
  libraryDeckSeries: LibraryDeckSeriesRecord;
  preferences: PreferencesRecord;
  reviewState: ReviewStateRecord;
  step: StepRecord;
};

/** The latest record of each kind: what this app writes. */
export type LatestRecord = {
  agent: AgentV1;
  answer: AnswerV1;
  card: CardV5;
  catalog: CatalogV1;
  chapter: ChapterV1;
  deck: DeckV6;
  deckGroup: DeckGroupV1;
  deckSchedule: DeckScheduleV1;
  distractor: DistractorV1;
  distribution: DistributionV1;
  documentReceipt: DocumentReceiptV1;
  instance: InstanceV2;
  libraryDeck: LibraryDeckV5;
  libraryDeckSeries: LibraryDeckSeriesV3;
  preferences: PreferencesV4;
  reviewState: ReviewStateV2;
  step: StepV1;
};
