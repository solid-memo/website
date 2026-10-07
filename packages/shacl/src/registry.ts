import type { ShapeName } from "@solid-memo/vocab/types.generated";
import type { ShapeContext, ShapeDescriptor } from "@solid-memo/vocab/shapeDescriptor";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import { SM_NS } from "@solid-memo/vocab/vocab.generated";

/**
 * Which shape a subject is checked against: chosen by its rdf:type, its
 * sm:formatVersion (absent = 1) and where it lives. The shapes carry no
 * sh:targetClass on purpose — version 1 and version 2 of a class would
 * otherwise both fire on every subject — so this choice is made here,
 * the same way at build time, in tests and in the browser.
 */
export type ShapePick =
  | { kind: "shape"; descriptor: ShapeDescriptor }
  /** A version this app does not know: newer data, left alone. */
  | { kind: "unknown-version"; shape: ShapeName; version: number; latest: number }
  /** Not a Solid Memo subject (no sm: class, or none for this context). */
  | { kind: "untyped" };

export function pickShape(
  types: readonly string[],
  version: number,
  context: Exclude<ShapeContext, "any">,
): ShapePick {
  const matching = ALL_SHAPES.filter(
    (d) =>
      types.includes(d.targetClass) &&
      (d.context === "any" || d.context === context),
  );
  // A subject with a Solid Memo class is checked as that class only: a
  // deck group is a dcat:Catalog too, but not the catalogue.
  const own = (d: ShapeDescriptor) => d.targetClass.startsWith(SM_NS);
  const candidates = matching.some(own) ? matching.filter(own) : matching;
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
