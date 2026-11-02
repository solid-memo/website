// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ShapeName } from "@solid-memo/vocab/types.generated";
import type { ShapeContext, ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { SM_NS } from "@solid-memo/vocab/vocab.generated";

/**
 * Which shapes a subject is checked against: chosen by its rdf:types,
 * its sm:formatVersion (absent = 1), the fixed values some shapes ask of
 * it and where it lives. The shapes carry no sh:targetClass on purpose —
 * version 1 and version 2 of a class would otherwise both fire on every
 * subject — so this choice is made here, the same way at build time, in
 * tests and in the browser.
 */
export type ShapePick =
  /**
   * The shape of each class of the subject that has one at its version,
   * and the classes whose shapes do not have that version: a subject is
   * held to every class it has, as each class's reader reads it as one.
   */
  | { kind: "shapes"; descriptors: readonly ShapeDescriptor[]; unknown: readonly ShapeName[] }
  /** A version none of its classes' shapes has: newer data, left alone. */
  | { kind: "unknown-version"; shape: ShapeName; version: number; latest: number }
  /** Not a Solid Memo subject (no sm: class, or none for this context). */
  | { kind: "untyped" };

/** The IRIs a subject has as values of one predicate. */
export type ValuesOf = (predicate: string) => readonly string[];

/**
 * The shapes for a subject, one for each of its classes. A shape with
 * fixed values (an FSRS-6 review state's sm:scheduler) fits only a
 * subject that has them all, and is then preferred to its class's
 * shapes without: an FSRS-6 state is never checked as an SM-2 one, nor
 * an SM-2 state as FSRS-6's.
 */
export function pickShapes(
  types: readonly string[],
  version: number,
  context: Exclude<ShapeContext, "any">,
  valuesOf: ValuesOf,
): ShapePick {
  const matching = ALL_SHAPES.filter(
    (d) =>
      types.includes(d.targetClass) &&
      (d.context === "any" || d.context === context) &&
      d.fixedValues.every((fixed) => valuesOf(fixed.predicate).includes(fixed.value)),
  );
  // A subject with a Solid Memo class is checked as its Solid Memo
  // classes only: a deck group is a dcat:Catalog too, but not the catalog.
  const own = (d: ShapeDescriptor) => d.targetClass.startsWith(SM_NS);
  const classed = matching.some(own) ? matching.filter(own) : matching;
  if (classed.length === 0) return { kind: "untyped" };
  const fixed = (d: ShapeDescriptor) => d.fixedValues.length > 0;
  const byClass = [...new Set(classed.map((d) => d.targetClass))].map((targetClass) => {
    const ofClass = classed.filter((d) => d.targetClass === targetClass);
    return ofClass.some(fixed) ? ofClass.filter(fixed) : ofClass;
  });
  const descriptors: ShapeDescriptor[] = [];
  const unknown: ShapeName[] = [];
  for (const candidates of byClass) {
    const descriptor = candidates.find((d) => d.version === version);
    if (descriptor === undefined) unknown.push(candidates[0].shape);
    else descriptors.push(descriptor);
  }
  if (descriptors.length > 0) return { kind: "shapes", descriptors, unknown };
  const [candidates] = byClass;
  return {
    kind: "unknown-version",
    shape: candidates[0].shape,
    version,
    latest: Math.max(...candidates.map((d) => d.version)),
  };
}
