// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  ANSWER_MODES,
  INVALID_DATA_POLICIES,
  PALETTES as PALETTE_SCHEME,
  SCHEDULERS,
  STUDY_DIRECTIONS,
  TEXT_SIZES as TEXT_SIZE_SCHEME,
  THEMES as THEME_SCHEME,
  type Concept,
  type ConceptScheme,
} from "@solid-memo/vocab/concepts.generated";
import type { AnswerMode } from "./answer";
import { isDeckDirection, type DeckDirection } from "./deck";
import type { Scheduler } from "./fsrs";
import { isInvalidDataPolicy, type InvalidDataPolicy } from "./invalidDataPolicy";
import { isPalette, type Palette } from "./palette";
import { isTextSize, type TextSize } from "./textSize";
import { isThemeChoice, type ThemeChoice } from "./theme";

/** The IRI of a concept of the StudyDirections scheme. */
export type StudyDirectionConcept = (typeof STUDY_DIRECTIONS.concepts)[number]["iri"];

/** The IRI of a concept of the InvalidDataPolicies scheme. */
export type InvalidDataPolicyConcept = (typeof INVALID_DATA_POLICIES.concepts)[number]["iri"];

/** The IRI of a concept of the AnswerModes scheme. */
export type AnswerModeConcept = (typeof ANSWER_MODES.concepts)[number]["iri"];

/** The IRI of a concept of the Themes scheme. */
export type ThemeConcept = (typeof THEME_SCHEME.concepts)[number]["iri"];

/** The IRI of a concept of the Palettes scheme. */
export type PaletteConcept = (typeof PALETTE_SCHEME.concepts)[number]["iri"];

/** The IRI of a concept of the TextSizes scheme. */
export type TextSizeConcept = (typeof TEXT_SIZE_SCHEME.concepts)[number]["iri"];

/** The IRI of a concept of the Schedulers scheme. */
export type SchedulerConcept = (typeof SCHEDULERS.concepts)[number]["iri"];

/**
 * Lookups over Solid Memo's SKOS concept schemes (generated from
 * ns/vocab/v1.ttl and ns/vocab/topics.ttl; see docs/vocab.md). Data names a
 * concept by its IRI; the app's own code, where a scheme predates it,
 * by the concept's notation.
 */

export function conceptByIri(scheme: ConceptScheme, iri: string): Concept | undefined {
  return scheme.concepts.find((concept) => concept.iri === iri);
}

export function conceptByNotation(scheme: ConceptScheme, notation: string): Concept | undefined {
  return scheme.concepts.find((concept) => concept.notation === notation);
}

/** The study direction a concept of the StudyDirections scheme names. */
export function directionOfConcept(iri: string): DeckDirection | undefined {
  const notation = conceptByIri(STUDY_DIRECTIONS, iri)?.notation;
  return notation !== undefined && isDeckDirection(notation) ? notation : undefined;
}

/** The concept of the StudyDirections scheme that names a study direction. */
export function conceptOfDirection(direction: DeckDirection): StudyDirectionConcept {
  return conceptByNotation(STUDY_DIRECTIONS, direction)!.iri as StudyDirectionConcept;
}

/** The policy a concept of the InvalidDataPolicies scheme names. */
export function policyOfConcept(iri: string): InvalidDataPolicy | undefined {
  const notation = conceptByIri(INVALID_DATA_POLICIES, iri)?.notation;
  return notation !== undefined && isInvalidDataPolicy(notation) ? notation : undefined;
}

/** The concept of the InvalidDataPolicies scheme that names a policy. */
export function conceptOfPolicy(policy: InvalidDataPolicy): InvalidDataPolicyConcept {
  return conceptByNotation(INVALID_DATA_POLICIES, policy)!.iri as InvalidDataPolicyConcept;
}

/** The theme choice a concept of the Themes scheme names. */
export function themeOfConcept(iri: string): ThemeChoice | undefined {
  const notation = conceptByIri(THEME_SCHEME, iri)?.notation;
  return notation !== undefined && isThemeChoice(notation) ? notation : undefined;
}

/** The concept of the Themes scheme that names a theme choice. */
export function conceptOfTheme(choice: ThemeChoice): ThemeConcept {
  return conceptByNotation(THEME_SCHEME, choice)!.iri as ThemeConcept;
}

/**
 * The palette a concept of the Palettes scheme names; undefined for any
 * other IRI, a later version's palette or one of the user's own.
 */
export function paletteOfConcept(iri: string): Palette | undefined {
  const notation = conceptByIri(PALETTE_SCHEME, iri)?.notation;
  return notation !== undefined && isPalette(notation) ? notation : undefined;
}

/** The concept of the Palettes scheme that names a palette. */
export function conceptOfPalette(palette: Palette): PaletteConcept {
  return conceptByNotation(PALETTE_SCHEME, palette)!.iri as PaletteConcept;
}

/** The text size a concept of the TextSizes scheme names. */
export function textSizeOfConcept(iri: string): TextSize | undefined {
  const notation = conceptByIri(TEXT_SIZE_SCHEME, iri)?.notation;
  return notation !== undefined && isTextSize(notation) ? notation : undefined;
}

/** The concept of the TextSizes scheme that names a text size. */
export function conceptOfTextSize(size: TextSize): TextSizeConcept {
  return conceptByNotation(TEXT_SIZE_SCHEME, size)!.iri as TextSizeConcept;
}

/** The answer mode a concept of the AnswerModes scheme names. */
export function answerModeOfConcept(iri: string): AnswerMode | undefined {
  return conceptByIri(ANSWER_MODES, iri)?.notation as AnswerMode | undefined;
}

/** The concept of the AnswerModes scheme that names an answer mode. */
export function conceptOfAnswerMode(mode: AnswerMode): AnswerModeConcept {
  return conceptByNotation(ANSWER_MODES, mode)!.iri as AnswerModeConcept;
}

/** The scheduler a concept of the Schedulers scheme names. */
export function schedulerOfConcept(iri: string): Scheduler | undefined {
  return conceptByIri(SCHEDULERS, iri)?.notation as Scheduler | undefined;
}

/** The concept of the Schedulers scheme that names a scheduler. */
export function conceptOfScheduler(scheduler: Scheduler): SchedulerConcept {
  return conceptByNotation(SCHEDULERS, scheduler)!.iri as SchedulerConcept;
}
