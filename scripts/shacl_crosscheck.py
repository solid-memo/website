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
- SkoHub's SKOS shapes, best practice included, over ns/vocab/v1.ttl
  and ns/vocab/topics.ttl, where warnings fail too.

Every document is read from this repository, at the address the site
publishes it under; nothing needs the network.

Solid Memo's own shapes are not run here: they have no targets (the app
picks a subject's shape by its class and format version), which is what
`npm run library:check` and the tests check them with.

Run:  python3 scripts/shacl_crosscheck.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from pyshacl import validate
from rdflib import Graph

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
    ]
    for pod in pods:
        name = pod.relative_to(VOCAB / "fixtures").as_posix()
        data = graph((pod, "https://pod.example/solid-memo/main/catalog.ttl"), *reference)
        results.append(check(f"a pod catalog document, {name} (DCAT-AP)", data, dcat_ap, warnings_fail=False))
    for vocab in ("ns/vocab/v1.ttl", "ns/vocab/topics.ttl"):
        results.append(check(f"{vocab} (SKOS, best practice)", graph(site(vocab)), skos, warnings_fail=True))
    failed = results.count(False)
    print(f"{len(results) - failed} of {len(results)} documents conform.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
