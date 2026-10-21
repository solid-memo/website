#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

"""Cross-check what Solid Memo publishes with an independent SHACL engine.

`npm run library:check` validates the deck library and the tests
validate the vocabulary and the pod fixtures with rdf-validate-shacl
(SHACL Core). This script checks the same documents with pySHACL, a separate implementation that
also runs SPARQL-based constraints (SkoHub's SKOS best practice has
some), so a disagreement between the engines, or a constraint the
browser's engine cannot run, fails CI (see docs/validation.md):

- DCAT-AP 3 over the deck library: decks/index.ttl and every release
  decks/<name>/v<N>.ttl, each with the index and the reference data
  (ns/vocab/external.ttl, ns/vocab/topics.ttl) beside it. A release's
  check targets only the subjects it states something about: DCAT-AP
  asks a node only about itself, and the index has its own check (the
  script stops if DCAT-AP or the documents ever make that untrue);
- DCAT-AP 3 over pod catalog documents as the app writes them (the
  valid pod fixtures of deck formats 4, 5 and 6 under
  packages/vocab/fixtures/deck/: format 5 titles and describes a deck in
  any language, English or not, and format 6 tags its keywords with
  their language, several per language), with the reference data
  (ns/vocab/external.ttl, ns/vocab/topics.ttl) beside them. A cards
  document has no DCAT subjects, so DCAT-AP has nothing to say about it;
- DCAT-AP 3 over a release published in a pod (the valid fixtures of
  library deck format 6 under packages/vocab/fixtures/library-deck/v6/),
  which describes its series and publisher itself, with only the
  reference data beside it: no index;
- Solid Memo's own shapes over the valid fixtures of the formats the
  Studio writes (library deck format 6, a release in a pod, and the
  draft deck, chapter and step formats, a draft of one), and of the
  review states a reviews document holds (review-state format 2 and
  FSRS review-state format 1, told apart by their scheduler), and of the
  palettes a user designs (palette and color set format 1, the color
  set's shape closed and its colors held to a pattern). The shapes
  have no targets (the app picks a subject's shape by its class, format
  version, context and the values some shapes fix): this script picks
  them the same way, and states each pick as an sh:targetNode;
- SkoHub's SKOS shapes, best practice included, over ns/vocab/v1.ttl
  and ns/vocab/topics.ttl, where warnings fail too.

Every document is read from this repository, at the address the site
publishes it under; nothing needs the network. The documents are checked
in parallel, one process per CPU the script may use.

The rest of Solid Memo's shapes are checked by `npm run library:check`
and the tests, with rdf-validate-shacl.

Run:  npm run crosscheck  (or python3 scripts/shacl_crosscheck.py)
"""

from __future__ import annotations

import sys
from concurrent.futures import ProcessPoolExecutor
from functools import cache, partial
from pathlib import Path

try:
    from pyshacl import validate
    from rdflib import Graph, Literal, Namespace, URIRef
    from rdflib.namespace import RDF, RDFS
except ModuleNotFoundError as missing:
    # pySHACL (which brings rdflib) is not part of the npm install: say how
    # to get it rather than end on a traceback.
    sys.exit(f"{missing.name} is not installed: pip install -r scripts/requirements-ci.txt (in a virtual environment, if your Python is externally managed), then npm run crosscheck again.")

ROOT = Path(__file__).resolve().parent.parent
VOCAB = ROOT / "packages" / "vocab"
SITE = "https://solid-memo.com/"


def graph(*documents: tuple[Path, str]) -> Graph:
    """The documents parsed into one graph, each against its own base."""
    merged = Graph()
    for path, base in documents:
        merged.parse(path, format="turtle", publicID=base)
    return merged


def site(path: str) -> tuple[Path, str]:
    """A file the site publishes at `path`: ns/ and decks/ from the repository, vendor/ from the vocab package."""
    return (VOCAB if path.startswith("vendor/") else ROOT) / path, SITE + path


SH = Namespace("http://www.w3.org/ns/shacl#")
SM = Namespace("https://solid-memo.com/ns/vocab/v1.ttl#")
# The node shape fragments that name where a subject lives, as
# packages/vocab/tooling/shapes.ts reads them; any other fits everywhere.
CONTEXTS = {"inPod": "pod", "inLibrary": "library", "inDraft": "draft"}


Pick = tuple[URIRef, URIRef, int, str, frozenset[tuple[URIRef, URIRef]]]


def fixed_values(shapes: Graph, shape: URIRef) -> frozenset[tuple[URIRef, URIRef]]:
    """The (predicate, value) pairs a node shape fixes: sh:hasValue with sh:maxCount 1 on a predicate other than rdf:type, as packages/vocab/tooling/shapes.ts reads them."""
    fixed = set()
    for prop in shapes.objects(shape, SH.property):
        path, value = shapes.value(prop, SH.path), shapes.value(prop, SH.hasValue)
        if path not in (None, RDF.type, SM.formatVersion) and value is not None and shapes.value(prop, SH.maxCount) == Literal(1):
            fixed.add((path, value))
    return frozenset(fixed)


def own_shapes() -> tuple[Graph, list[Pick]]:
    """Every Solid Memo shape in one graph, and each named node shape's (IRI, class, version, context, fixed values)."""
    shapes = graph(*(site(path.relative_to(ROOT).as_posix()) for path in sorted((ROOT / "ns" / "shapes").glob("*/v*.ttl"))))
    picks = []
    for shape, name in shapes.subject_objects(SH.name):
        if (shape, RDF.type, SH.NodeShape) not in shapes:
            continue
        version = int(str(name).rsplit("V", 1)[1])
        context = CONTEXTS.get(str(shape).rsplit("#", 1)[1], "any")
        picks.append((shape, shapes.value(shape, SH["class"]), version, context, fixed_values(shapes, shape)))
    return shapes, picks


def targeted(data: Graph, shapes: Graph, picks: list[Pick], context: str) -> Graph:
    """The shapes with each subject of `data` targeted at the shape the app picks for it (registry.ts, pickShape).

    A shape that fixes values fits only a subject that has them all, and is
    then preferred to its class's shapes without (an FSRS-6 review state).
    """
    chosen = Graph() + shapes
    for subject in set(data.subjects(RDF.type, None)):
        types = set(data.objects(subject, RDF.type))
        matching = [p for p in picks if p[1] in types and p[3] in ("any", context) and all((subject, predicate, value) in data for predicate, value in p[4])]
        own = [p for p in matching if str(p[1]).startswith(str(SM))]
        classed = own or matching
        fixed = [p for p in classed if p[4]]
        version = int(data.value(subject, SM.formatVersion, default=Literal(1)))
        picked = [p for p in (fixed or classed) if p[2] == version]
        if not picked and (matching or any(str(t).startswith(str(SM)) for t in types)):
            # The app reports such a subject (untyped or newer); here it must not slip by unchecked.
            raise ValueError(f"{subject} has no {context} shape at format {version}.")
        for shape, *_ in picked:
            chosen.add((shape, SH.targetNode, subject))
    return chosen


REFERENCE = [site("ns/vocab/external.ttl"), site("ns/vocab/topics.ttl")]
# DCAT-AP asks a node only about its own statements and the class of what
# they point at, and no document states rdfs:subClassOf, so a release can
# only give an index node a class it lacked, never break it: deck_release()
# checks the release's own subjects only. DCAT_AP_TERMS is what that
# relies on (sh:name and sh:description are labels).
DCAT_AP_TERMS = {SH[term] for term in ("property", "path", "name", "description", "nodeKind", "class", "maxCount", "minCount", "datatype", "closed", "targetClass")}


@cache
def dcat_ap() -> Graph:
    """DCAT-AP 3.0.1's shapes, once per process, provided they still use only DCAT_AP_TERMS and close no shape."""
    shapes = graph(site("vendor/dcat-ap/3.0.1/dcat-ap-SHACL.ttl"))
    terms = {p for p in shapes.predicates() if str(p).startswith(str(SH))}
    if not terms <= DCAT_AP_TERMS or (None, SH.closed, Literal(True)) in shapes:
        raise ValueError(f"DCAT-AP now uses {sorted(terms - DCAT_AP_TERMS)} or closes a shape: a release might break the index unseen (DCAT_AP_TERMS).")
    return shapes


@cache
def library() -> Graph:
    """decks/index.ttl and the reference data, once per process: every release is checked beside them."""
    return without_subclasses(graph(site("decks/index.ttl"), *REFERENCE), "the index or the reference data")


def without_subclasses(data: Graph, name: str) -> Graph:
    if (None, RDFS.subClassOf, None) in data:
        raise ValueError(f"{name} states rdfs:subClassOf: a release might then break the index unseen (DCAT_AP_TERMS).")
    return data


def own_subjects(shapes: Graph, document: Graph, data: Graph) -> Graph:
    """The shapes with each class target narrowed to the subjects `document` states something about."""
    narrowed = Graph()
    for triple in shapes.triples((None, None, None)):
        if triple[1] != SH.targetClass:
            narrowed.add(triple)
    subjects = set(document.subjects())
    for shape, target in shapes.subject_objects(SH.targetClass):
        for subject in subjects.intersection(data.subjects(RDF.type, target)):
            narrowed.add((shape, SH.targetNode, subject))
    return narrowed


def deck_release(name: str) -> tuple[bool, str]:
    """Whether a release conforms to DCAT-AP beside the index and the reference data, whose own nodes the index's check covers."""
    document = without_subclasses(graph(site(name)), name)
    data = library()
    # Adding the release to the shared graph and taking it out again is far
    # cheaper than copying the index for each release.
    added = [triple for triple in document if triple not in data]
    for triple in added:
        data.add(triple)
    try:
        return conformance(data, own_subjects(dcat_ap(), document, data), warnings_fail=False)
    finally:
        for triple in added:
            data.remove(triple)


def conformance(data: Graph, shapes: Graph, *, warnings_fail: bool) -> tuple[bool, str]:
    """Whether `data` conforms to `shapes`, and pySHACL's report."""
    conforms, _, text = validate(
        data,
        shacl_graph=shapes,
        inference="none",
        advanced=True,
        # advanced=True would copy the data graph in case a sh:rule writes to it; no shape here has one.
        inplace=True,
        allow_warnings=not warnings_fail,
        allow_infos=True,
    )
    return conforms, text


def main() -> int:
    skos = graph(site("vendor/skohub/skos.shacl.ttl"), site("vendor/skohub/skos.bestPractice.shacl.ttl"))

    index = site("decks/index.ttl")

    # Each job: its label, the check, and roughly how long it takes (the
    # larger, the sooner it starts, so the slowest do not finish last).
    jobs = [("decks/index.ttl (DCAT-AP)", partial(conformance, graph(index, *REFERENCE), dcat_ap(), warnings_fail=False), index[0].stat().st_size)]
    for path in sorted((ROOT / "decks").glob("*/v*.ttl")):
        name = path.relative_to(ROOT).as_posix()
        jobs.append((f"{name} (DCAT-AP)", partial(deck_release, name), path.stat().st_size))
    pods = [
        VOCAB / "fixtures/deck/v4/valid/pod.ttl",
        *sorted((VOCAB / "fixtures/deck/v5/valid").glob("pod*.ttl")),
        *sorted((VOCAB / "fixtures/deck/v6/valid").glob("pod*.ttl")),
        *sorted((VOCAB / "fixtures/deck-group/v1/valid").glob("pod*.ttl")),
    ]
    for pod in pods:
        name = pod.relative_to(VOCAB / "fixtures").as_posix()
        data = graph((pod, "https://pod.example/solid-memo/main/catalog.ttl"), *REFERENCE)
        jobs.append((f"a pod catalog document, {name} (DCAT-AP)", partial(conformance, data, dcat_ap(), warnings_fail=False), 0))
    standalone = sorted((VOCAB / "fixtures/library-deck/v6/valid").glob("*.ttl"))
    for release in standalone:
        name = release.relative_to(VOCAB / "fixtures").as_posix()
        data = graph((release, "https://pod.example/releases/release.ttl"), *REFERENCE)
        jobs.append((f"a release in a pod, {name} (DCAT-AP, no index)", partial(conformance, data, dcat_ap(), warnings_fail=False), 0))
    shapes, picks = own_shapes()
    studio = [(release, "library") for release in standalone] + [
        (draft, "draft") for kind in ("draft-deck", "draft-chapter", "draft-step") for draft in sorted((VOCAB / f"fixtures/{kind}/v1/valid").glob("*.ttl"))
    ]
    # The review states of a reviews document, SM-2's and FSRS-6's, each
    # picked by its scheduler.
    reviews = [(state, "pod") for kind in ("review-state/v2", "fsrs-review-state/v1") for state in sorted((VOCAB / f"fixtures/{kind}/valid").glob("*.ttl"))]
    # A palettes document: the palettes the user designed and their color sets.
    palettes = [(fixture, "pod") for kind in ("palette/v1", "color-set/v1") for fixture in sorted((VOCAB / f"fixtures/{kind}/valid").glob("*.ttl"))]
    for fixture, context in studio + reviews + palettes:
        name = fixture.relative_to(VOCAB / "fixtures").as_posix()
        data = graph((fixture, "https://pod.example/solid-memo/main/drafts/d/v1/release.ttl"))
        jobs.append((f"{name} (Solid Memo's shapes, {context})", partial(conformance, data, targeted(data, shapes, picks, context), warnings_fail=False), 0))
    for vocab in ("ns/vocab/v1.ttl", "ns/vocab/topics.ttl"):
        # SkoHub's SPARQL constraints make these the slowest of all.
        jobs.append((f"{vocab} (SKOS, best practice)", partial(conformance, graph(site(vocab)), skos, warnings_fail=True), sys.maxsize))
    failed = 0
    with ProcessPoolExecutor() as pool:
        running = {label: pool.submit(check) for label, check, _ in sorted(jobs, key=lambda job: job[2], reverse=True)}
        for label, _, _ in jobs:
            conforms, text = running[label].result()
            print(f"{'ok  ' if conforms else 'FAIL'} {label}", flush=True)
            if not conforms:
                failed += 1
                print(text)
    print(f"{len(jobs) - failed} of {len(jobs)} documents conform.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
