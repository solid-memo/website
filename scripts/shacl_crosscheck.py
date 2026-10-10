#!/usr/bin/env python3
"""Cross-check what Solid Memo publishes with an independent SHACL engine.

`npm run library:check` validates the deck library and the tests
validate the vocabulary and the pod fixtures with rdf-validate-shacl
(SHACL Core). This script checks the same documents with pySHACL, a separate implementation that
also runs SPARQL-based constraints (SkoHub's SKOS best practice has
some), so a disagreement between the engines, or a constraint the
browser's engine cannot run, fails CI (see docs/validation.md):

- DCAT-AP 3 over the deck library: decks/index.ttl and every release
  decks/<name>/v<N>.ttl, each with the index and the reference data
  (ns/vocab/external.ttl, ns/vocab/topics.ttl) beside it;
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
  draft deck, chapter and step formats, a draft of one). The shapes have
  no targets (the app picks a subject's shape by its class, format
  version and context): this script picks them the same way, and states
  each pick as an sh:targetNode;
- SkoHub's SKOS shapes, best practice included, over ns/vocab/v1.ttl
  and ns/vocab/topics.ttl, where warnings fail too.

Every document is read from this repository, at the address the site
publishes it under; nothing needs the network.

The rest of Solid Memo's shapes are checked by `npm run library:check`
and the tests, with rdf-validate-shacl.

Run:  npm run crosscheck  (or python3 scripts/shacl_crosscheck.py)
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from pyshacl import validate
    from rdflib import Graph, Literal, Namespace, URIRef
    from rdflib.namespace import RDF
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


def own_shapes() -> tuple[Graph, list[tuple[URIRef, URIRef, int, str]]]:
    """Every Solid Memo shape in one graph, and each named node shape's (IRI, class, version, context)."""
    shapes = graph(*(site(path.relative_to(ROOT).as_posix()) for path in sorted((ROOT / "ns" / "shapes").glob("*/v*.ttl"))))
    picks = []
    for shape, name in shapes.subject_objects(SH.name):
        if (shape, RDF.type, SH.NodeShape) not in shapes:
            continue
        version = int(str(name).rsplit("V", 1)[1])
        context = CONTEXTS.get(str(shape).rsplit("#", 1)[1], "any")
        picks.append((shape, shapes.value(shape, SH["class"]), version, context))
    return shapes, picks


def targeted(data: Graph, shapes: Graph, picks: list[tuple[URIRef, URIRef, int, str]], context: str) -> Graph:
    """The shapes with each subject of `data` targeted at the shape the app picks for it (registry.ts, pickShape)."""
    chosen = Graph() + shapes
    for subject in set(data.subjects(RDF.type, None)):
        types = set(data.objects(subject, RDF.type))
        matching = [p for p in picks if p[1] in types and p[3] in ("any", context)]
        own = [p for p in matching if str(p[1]).startswith(str(SM))]
        version = int(data.value(subject, SM.formatVersion, default=Literal(1)))
        picked = [p for p in (own or matching) if p[2] == version]
        if not picked and (matching or any(str(t).startswith(str(SM)) for t in types)):
            # The app reports such a subject (untyped or newer); here it must not slip by unchecked.
            raise ValueError(f"{subject} has no {context} shape at format {version}.")
        for shape, _, _, _ in picked:
            chosen.add((shape, SH.targetNode, subject))
    return chosen


def check(label: str, data: Graph, shapes: Graph, *, warnings_fail: bool) -> bool:
    conforms, _, text = validate(
        data,
        shacl_graph=shapes,
        inference="none",
        advanced=True,
        allow_warnings=not warnings_fail,
        allow_infos=True,
    )
    print(f"{'ok  ' if conforms else 'FAIL'} {label}")
    if not conforms:
        print(text)
    return conforms


def main() -> int:
    dcat_ap = graph(site("vendor/dcat-ap/3.0.1/dcat-ap-SHACL.ttl"))
    skos = graph(site("vendor/skohub/skos.shacl.ttl"), site("vendor/skohub/skos.bestPractice.shacl.ttl"))
    reference = [site("ns/vocab/external.ttl"), site("ns/vocab/topics.ttl")]

    index = site("decks/index.ttl")

    results = [check("decks/index.ttl (DCAT-AP)", graph(index, *reference), dcat_ap, warnings_fail=False)]
    for release in sorted((ROOT / "decks").glob("*/v*.ttl")):
        name = release.relative_to(ROOT).as_posix()
        data = graph(site(name), index, *reference)
        results.append(check(f"{name} (DCAT-AP)", data, dcat_ap, warnings_fail=False))
    pods = [
        VOCAB / "fixtures/deck/v4/valid/pod.ttl",
        *sorted((VOCAB / "fixtures/deck/v5/valid").glob("pod*.ttl")),
        *sorted((VOCAB / "fixtures/deck/v6/valid").glob("pod*.ttl")),
        *sorted((VOCAB / "fixtures/deck-group/v1/valid").glob("pod*.ttl")),
    ]
    for pod in pods:
        name = pod.relative_to(VOCAB / "fixtures").as_posix()
        data = graph((pod, "https://pod.example/solid-memo/main/catalog.ttl"), *reference)
        results.append(check(f"a pod catalog document, {name} (DCAT-AP)", data, dcat_ap, warnings_fail=False))
    standalone = sorted((VOCAB / "fixtures/library-deck/v6/valid").glob("*.ttl"))
    for release in standalone:
        name = release.relative_to(VOCAB / "fixtures").as_posix()
        data = graph((release, "https://pod.example/releases/release.ttl"), *reference)
        results.append(check(f"a release in a pod, {name} (DCAT-AP, no index)", data, dcat_ap, warnings_fail=False))
    shapes, picks = own_shapes()
    studio = [(release, "library") for release in standalone] + [
        (draft, "draft") for kind in ("draft-deck", "draft-chapter", "draft-step") for draft in sorted((VOCAB / f"fixtures/{kind}/v1/valid").glob("*.ttl"))
    ]
    for fixture, context in studio:
        name = fixture.relative_to(VOCAB / "fixtures").as_posix()
        data = graph((fixture, "https://pod.example/solid-memo/main/drafts/d/v1/release.ttl"))
        results.append(check(f"{name} (Solid Memo's shapes, {context})", data, targeted(data, shapes, picks, context), warnings_fail=False))
    for vocab in ("ns/vocab/v1.ttl", "ns/vocab/topics.ttl"):
        results.append(check(f"{vocab} (SKOS, best practice)", graph(site(vocab)), skos, warnings_fail=True))
    failed = results.count(False)
    print(f"{len(results) - failed} of {len(results)} documents conform.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
