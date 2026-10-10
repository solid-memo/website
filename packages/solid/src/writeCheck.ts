import type { SolidDataset } from "@inrupt/solid-client";
import type { ShapeContext } from "@solid-memo/vocab/shapeDescriptor";

/**
 * Where a write goes, which picks the shapes it is checked against: an
 * instance's documents ("pod"), or a release's draft ("draft"), whose
 * deck, chapters and steps are checked against the draft shapes. Every
 * caller states it; a published release is never written over.
 */
export type WriteContext = Exclude<ShapeContext, "any" | "library">;

/**
 * What a repository checks a document with before it saves it (see
 * docs/validation.md): throws, naming every problem, unless every
 * subject the write touches conforms to its shape and, in a document
 * with DCAT subjects, to DCAT-AP. The app wires the SHACL validator in;
 * without one, nothing is checked.
 */
export type WriteCheck = (dataset: SolidDataset, subjects: readonly string[], context: WriteContext) => Promise<void>;

export const noWriteCheck: WriteCheck = async () => undefined;
