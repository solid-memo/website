// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * rdfs:subClassOf statements a document may make of its classes, as
 * subject, predicate and object IRIs, for tests that a check stays
 * bounded whatever they are. Followed without memory of the classes
 * already seen, a cycle never ends and a diamond takes 2^depth steps.
 * `iri` names the new classes.
 */
type Triple = [string, string, string];

const RDFS_SUB_CLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";

/** A cycle of three statements through `cls`. */
export function subclassCycle(cls: string, iri: (name: string) => string): Triple[] {
  return [
    [iri("loop-1"), RDFS_SUB_CLASS_OF, cls],
    [iri("loop-2"), RDFS_SUB_CLASS_OF, iri("loop-1")],
    [cls, RDFS_SUB_CLASS_OF, iri("loop-2")],
  ];
}

/** A diamond `depth` layers deep under `cls`: two classes a layer, each a subclass of both classes of the layer below. */
export function subclassDiamond(cls: string, iri: (name: string) => string, depth = 30): Triple[] {
  const layer = (n: number) => (n === 0 ? [cls] : [iri(`layer-${n}-a`), iri(`layer-${n}-b`)]);
  return Array.from({ length: depth }, (_, i) =>
    layer(i + 1).flatMap((sub) => layer(i).map((sup): Triple => [sub, RDFS_SUB_CLASS_OF, sup])),
  ).flat();
}
