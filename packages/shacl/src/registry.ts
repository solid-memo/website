// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ShapeName } from "@solid-memo/vocab/types.generated";
import type { ShapeContext, ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { SM_NS } from "@solid-memo/vocab/vocab.generated";

/**
 * Which shape a subject is checked against: chosen by its rdf:type, its
 * sm:formatVersion (absent = 1), the fixed values some shapes ask of it
 * and where it lives. The shapes carry no sh:targetClass on purpose —
 * version 1 and version 2 of a class would otherwise both fire on every
 * subject — so this choice is made here, the same way at build time, in
 * tests and in the browser.
 */
export type ShapePick =
  | { kind: "shape"; descriptor: ShapeDescriptor }
  /** A version this app does not know: newer data, left alone. */
  | { kind: "unknown-version"; shape: ShapeName; version: number; latest: number }
  /** Not a Solid Memo subject (no sm: class, or none for this context). */
  | { kind: "untyped" };

/** The IRIs a subject has as values of one predicate. */
export type ValuesOf = (predicate: string) => readonly string[];

/**
 * The shape for a subject. A shape with fixed values (an FSRS-6 review
 * state's sm:scheduler) fits only a subject that has them all, and is
 * then preferred to its class's shapes without: an FSRS-6 state is never
 * checked as an SM-2 one, nor an SM-2 state as FSRS-6's.
 */
export function pickShape(
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
  // A subject with a Solid Memo class is checked as that class only: a
  // deck group is a dcat:Catalog too, but not the catalog.
  const own = (d: ShapeDescriptor) => d.targetClass.startsWith(SM_NS);
  const classed = matching.some(own) ? matching.filter(own) : matching;
  const fixed = (d: ShapeDescriptor) => d.fixedValues.length > 0;
  const candidates = classed.some(fixed) ? classed.filter(fixed) : classed;
  if (candidates.length === 0) return { kind: "untyped" };
  const descriptor = candidates.find((d) => d.version === version);
  if (descriptor !== undefined) return { kind: "shape", descriptor };
  return {
    kind: "unknown-version",
    shape: candidates[0].shape,
    version,
    latest: Math.max(...candidates.map((d) => d.version)),
  };
}
