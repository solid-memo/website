# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

"""Tests of scripts/shacl_crosscheck.py, with the standard library's unittest.

Each test builds a small repository of its own in a temporary folder
(a few lines of Turtle in place of DCAT-AP, SkoHub's shapes, the index
and the fixtures) and points the script at it, so the tests read nothing
of the real repository and need no network.

Run:  npm run test:crosscheck  (or python3 -m unittest discover -s scripts)
"""

from __future__ import annotations

import importlib.util
import io
import sys
import tempfile
import textwrap
import unittest
from concurrent.futures import Future
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

import shacl_crosscheck as crosscheck
from rdflib import Graph, Literal, Namespace, URIRef
from rdflib.namespace import RDF, RDFS

DCAT = Namespace("http://www.w3.org/ns/dcat#")
EX = Namespace("https://example.org/")
SH = crosscheck.SH
SM = crosscheck.SM

PREFIXES = """\
@prefix dcat: <http://www.w3.org/ns/dcat#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix ex: <https://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema: <https://schema.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix sm: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
"""

# In place of DCAT-AP: a dataset has a title. It uses only DCAT_AP_TERMS.
DCAT_AP = """\
<#Dataset> a sh:NodeShape ;
    sh:targetClass dcat:Dataset ;
    sh:property [ sh:path dct:title ; sh:minCount 1 ; sh:name "title" ] .
"""

# In place of SkoHub's shapes: a concept should have a label, as a warning.
SKOS = """\
<#Concept> a sh:NodeShape ;
    sh:targetClass skos:Concept ;
    sh:property [ sh:path skos:prefLabel ; sh:minCount 1 ; sh:severity sh:Warning ] .
"""

# Solid Memo's shapes: a thing in a draft at format 1, anywhere at format
# 2, and a learning resource (not a Solid Memo class) anywhere at format 1.
THING_V1 = """\
<#inDraft> a sh:NodeShape ;
    sh:name "ThingV1" ;
    sh:class sm:Thing ;
    sh:property <#label> .
<#label> sh:name "label" ; sh:path rdfs:label ; sh:minCount 1 .
"""
THING_V2 = """\
<#thing> a sh:NodeShape ; sh:name "ThingV2" ; sh:class sm:Thing .
"""
RESOURCE_V1 = """\
<#resource> a sh:NodeShape ; sh:name "ResourceV1" ; sh:class schema:LearningResource .
"""
# A shape of the same class that fixes a value, as FSRS review-state
# format 1 fixes its scheduler; the theme beside it repeats, so it is no
# fixed value.
SPECIAL_THING_V1 = """\
<#special> a sh:NodeShape ;
    sh:name "SpecialThingV1" ;
    sh:class sm:Thing ;
    sh:property <#kind> , <#theme> .
<#kind> sh:path sm:kind ; sh:hasValue sm:special ; sh:maxCount 1 .
<#theme> sh:path dcat:theme ; sh:hasValue ex:theme .
"""


def turtle(text: str) -> Graph:
    return Graph().parse(data=PREFIXES + text, format="turtle", publicID="https://example.org/doc.ttl")


class Repository(unittest.TestCase):
    """A test with a repository of its own, which the script reads in place of this one."""

    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.vocab = self.root / "packages" / "vocab"
        for name, value in (("ROOT", self.root), ("VOCAB", self.vocab)):
            patch = mock.patch.object(crosscheck, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        # REFERENCE is worked out when the script loads: again, from here.
        patch = mock.patch.object(crosscheck, "REFERENCE", [crosscheck.site(path) for path in ("ns/vocab/external.ttl", "ns/vocab/topics.ttl")])
        patch.start()
        self.addCleanup(patch.stop)
        for cached in (crosscheck.dcat_ap, crosscheck.library):
            cached.cache_clear()
            self.addCleanup(cached.cache_clear)
        self.write("packages/vocab/vendor/dcat-ap/3.0.1/dcat-ap-SHACL.ttl", DCAT_AP)
        self.write("packages/vocab/vendor/skohub/skos.shacl.ttl", SKOS)
        self.write("packages/vocab/vendor/skohub/skos.bestPractice.shacl.ttl", "")
        self.write("ns/vocab/external.ttl", 'ex:license a dct:LicenseDocument ; rdfs:label "A license" .')
        self.write("ns/vocab/topics.ttl", 'ex:topic a skos:Concept ; skos:prefLabel "A topic" .')
        self.write("ns/vocab/v1.ttl", 'sm:Thing a skos:Concept ; skos:prefLabel "Thing" .')
        self.write("decks/index.ttl", 'ex:series a dcat:Dataset ; dct:title "A series" .')

    def write(self, path: str, text: str) -> Path:
        file = self.root / path
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(PREFIXES + textwrap.dedent(text), encoding="utf-8")
        return file


class Graphs(Repository):
    def test_parses_each_document_against_its_own_base(self) -> None:
        first = self.write("one.ttl", '<#a> rdfs:label "a" .')
        second = self.write("two.ttl", '<#a> rdfs:label "b" .')
        merged = crosscheck.graph((first, "https://example.org/one"), (second, "https://example.org/two"))
        self.assertEqual(merged.value(URIRef("https://example.org/one#a"), RDFS.label), Literal("a"))
        self.assertEqual(merged.value(URIRef("https://example.org/two#a"), RDFS.label), Literal("b"))

    def test_reads_vendor_from_the_vocab_package_and_the_rest_from_the_repository(self) -> None:
        self.assertEqual(crosscheck.site("vendor/x.ttl"), (self.vocab / "vendor/x.ttl", "https://solid-memo.com/vendor/x.ttl"))
        self.assertEqual(crosscheck.site("ns/x.ttl"), (self.root / "ns/x.ttl", "https://solid-memo.com/ns/x.ttl"))


class OwnShapes(Repository):
    def setUp(self) -> None:
        super().setUp()
        self.write("ns/shapes/thing/v1.ttl", THING_V1)
        self.write("ns/shapes/thing/v2.ttl", THING_V2)
        self.write("ns/shapes/resource/v1.ttl", RESOURCE_V1)
        self.write("ns/shapes/special-thing/v1.ttl", SPECIAL_THING_V1)
        self.shapes, self.picks = crosscheck.own_shapes()

    def shape(self, path: str, fragment: str) -> URIRef:
        return URIRef(f"https://solid-memo.com/ns/shapes/{path}#{fragment}")

    def test_names_each_node_shape_by_class_version_and_context(self) -> None:
        schema = URIRef("https://schema.org/LearningResource")
        self.assertCountEqual(
            self.picks,
            [
                (self.shape("thing/v1.ttl", "inDraft"), SM.Thing, 1, "draft", frozenset()),
                (self.shape("thing/v2.ttl", "thing"), SM.Thing, 2, "any", frozenset()),
                (self.shape("resource/v1.ttl", "resource"), schema, 1, "any", frozenset()),
                (self.shape("special-thing/v1.ttl", "special"), SM.Thing, 1, "any", frozenset({(SM.kind, SM.special)})),
            ],
        )
        # The property shape is named too, but is no node shape.
        self.assertIn((self.shape("thing/v1.ttl", "label"), SH.name, Literal("label")), self.shapes)

    def targets(self, data: str, context: str) -> set[tuple[URIRef, URIRef]]:
        chosen = crosscheck.targeted(turtle(data), self.shapes, self.picks, context)
        return set(chosen.subject_objects(SH.targetNode))

    def test_targets_the_shape_of_the_subjects_class_version_and_context(self) -> None:
        self.assertEqual(self.targets("ex:a a sm:Thing ; sm:formatVersion 1 .", "draft"), {(self.shape("thing/v1.ttl", "inDraft"), EX.a)})
        self.assertEqual(self.targets("ex:a a sm:Thing ; sm:formatVersion 2 .", "library"), {(self.shape("thing/v2.ttl", "thing"), EX.a)})

    def test_takes_a_subject_without_a_format_version_to_be_at_format_1(self) -> None:
        self.assertEqual(self.targets("ex:a a sm:Thing .", "draft"), {(self.shape("thing/v1.ttl", "inDraft"), EX.a)})

    def test_prefers_the_shape_of_a_solid_memo_class(self) -> None:
        data = "ex:a a sm:Thing , schema:LearningResource ; sm:formatVersion 1 ."
        self.assertEqual(self.targets(data, "draft"), {(self.shape("thing/v1.ttl", "inDraft"), EX.a)})
        self.assertEqual(self.targets("ex:a a schema:LearningResource .", "draft"), {(self.shape("resource/v1.ttl", "resource"), EX.a)})

    def test_prefers_the_shape_whose_fixed_values_the_subject_has_and_never_picks_it_without_them(self) -> None:
        special = self.shape("special-thing/v1.ttl", "special")
        self.assertEqual(self.targets("ex:a a sm:Thing ; sm:kind sm:special .", "draft"), {(special, EX.a)})
        self.assertEqual(self.targets("ex:a a sm:Thing ; sm:kind sm:special .", "pod"), {(special, EX.a)})
        self.assertEqual(self.targets("ex:a a sm:Thing ; sm:kind sm:other .", "draft"), {(self.shape("thing/v1.ttl", "inDraft"), EX.a)})
        self.assertEqual(self.targets("ex:a a sm:Thing ; sm:formatVersion 2 .", "pod"), {(self.shape("thing/v2.ttl", "thing"), EX.a)})
        # A version the fixed shape does not have is not checked as the class's other shapes.
        with self.assertRaisesRegex(ValueError, "https://example.org/a has no pod shape at format 2"):
            self.targets("ex:a a sm:Thing ; sm:kind sm:special ; sm:formatVersion 2 .", "pod")

    def test_leaves_a_subject_of_no_class_it_has_a_shape_for(self) -> None:
        self.assertEqual(self.targets("ex:a a dcat:Dataset .", "draft"), set())

    def test_keeps_the_shapes_beside_the_targets(self) -> None:
        chosen = crosscheck.targeted(turtle("ex:a a dcat:Dataset ."), self.shapes, self.picks, "draft")
        self.assertEqual(len(chosen), len(self.shapes))

    def test_stops_on_a_subject_with_no_shape_at_its_version_or_in_its_context(self) -> None:
        for data, context in (
            ("ex:a a sm:Thing ; sm:formatVersion 3 .", "draft"),
            ("ex:a a sm:Thing ; sm:formatVersion 1 .", "library"),
            ("ex:a a sm:Unknown .", "draft"),
        ):
            with self.subTest(data=data, context=context), self.assertRaisesRegex(ValueError, f"https://example.org/a has no {context} shape"):
                self.targets(data, context)


class DcatAp(Repository):
    def test_reads_the_shapes_once(self) -> None:
        shapes = crosscheck.dcat_ap()
        self.assertIn((None, SH.targetClass, DCAT.Dataset), shapes)
        self.assertIs(crosscheck.dcat_ap(), shapes)

    def test_stops_if_the_shapes_ask_more_than_it_relies_on(self) -> None:
        for extra in (
            '<#Dataset> sh:sparql [ sh:select "SELECT $this WHERE {}" ] .',
            "<#Dataset> sh:closed true .",
        ):
            with self.subTest(extra=extra):
                crosscheck.dcat_ap.cache_clear()
                self.write("packages/vocab/vendor/dcat-ap/3.0.1/dcat-ap-SHACL.ttl", DCAT_AP + extra)
                with self.assertRaisesRegex(ValueError, "DCAT_AP_TERMS"):
                    crosscheck.dcat_ap()


class Library(Repository):
    def test_reads_the_index_and_the_reference_data_once(self) -> None:
        data = crosscheck.library()
        self.assertIn((EX.series, RDF.type, DCAT.Dataset), data)
        self.assertIn((EX.topic, RDF.type, URIRef("http://www.w3.org/2004/02/skos/core#Concept")), data)
        self.assertIs(crosscheck.library(), data)

    def test_stops_if_the_index_or_the_reference_data_state_subclasses(self) -> None:
        self.write("ns/vocab/topics.ttl", "ex:a rdfs:subClassOf ex:b .")
        with self.assertRaisesRegex(ValueError, "the index or the reference data states rdfs:subClassOf"):
            crosscheck.library()

    def test_passes_a_graph_without_subclasses_through(self) -> None:
        data = turtle("ex:a a ex:B .")
        self.assertIs(crosscheck.without_subclasses(data, "it"), data)


class OwnSubjects(Repository):
    def test_narrows_each_class_target_to_the_subjects_the_document_states_something_about(self) -> None:
        document = turtle('ex:a dct:title "A" .')
        data = turtle("ex:a a dcat:Dataset . ex:b a dcat:Dataset .") + document
        narrowed = crosscheck.own_subjects(crosscheck.dcat_ap(), document, data)
        self.assertNotIn((None, SH.targetClass, None), narrowed)
        self.assertEqual(set(narrowed.objects(None, SH.targetNode)), {EX.a})
        self.assertIn((None, SH.path, URIRef("http://purl.org/dc/terms/title")), narrowed)


class DeckRelease(Repository):
    def test_checks_a_release_beside_the_index_and_leaves_the_index_as_it_was(self) -> None:
        self.write("decks/a/v1.ttl", 'ex:a a dcat:Dataset ; dct:title "A" ; dct:isPartOf ex:series .')
        before = set(crosscheck.library())
        conforms, _ = crosscheck.deck_release("decks/a/v1.ttl")
        self.assertTrue(conforms)
        self.assertEqual(set(crosscheck.library()), before)

    def test_fails_a_release_that_does_not_conform(self) -> None:
        self.write("decks/a/v1.ttl", "ex:a a dcat:Dataset .")
        conforms, text = crosscheck.deck_release("decks/a/v1.ttl")
        self.assertFalse(conforms)
        self.assertIn("MinCountConstraintComponent", text)

    def test_checks_only_the_releases_own_subjects(self) -> None:
        # An index node with no title would fail the index's own check, not the release's.
        self.write("decks/index.ttl", "ex:series a dcat:Dataset .")
        self.write("decks/a/v1.ttl", 'ex:a a dcat:Dataset ; dct:title "A" ; dct:isPartOf ex:series .')
        self.assertTrue(crosscheck.deck_release("decks/a/v1.ttl")[0])

    def test_takes_the_release_out_of_the_index_even_if_the_check_fails(self) -> None:
        self.write("decks/a/v1.ttl", 'ex:a a dcat:Dataset ; dct:title "A" .')
        before = set(crosscheck.library())
        with mock.patch.object(crosscheck, "conformance", side_effect=RuntimeError("broken")), self.assertRaisesRegex(RuntimeError, "broken"):
            crosscheck.deck_release("decks/a/v1.ttl")
        self.assertEqual(set(crosscheck.library()), before)

    def test_stops_on_a_release_that_states_subclasses(self) -> None:
        self.write("decks/a/v1.ttl", "ex:A rdfs:subClassOf dcat:Dataset .")
        with self.assertRaisesRegex(ValueError, "decks/a/v1.ttl states rdfs:subClassOf"):
            crosscheck.deck_release("decks/a/v1.ttl")


class Conformance(Repository):
    def test_fails_a_warning_only_when_warnings_fail(self) -> None:
        shapes = crosscheck.graph(crosscheck.site("vendor/skohub/skos.shacl.ttl"))
        data = turtle("ex:a a skos:Concept .")
        self.assertTrue(crosscheck.conformance(data, shapes, warnings_fail=False)[0])
        conforms, text = crosscheck.conformance(data, shapes, warnings_fail=True)
        self.assertFalse(conforms)
        self.assertIn("Warning", text)


class Inline:
    """In place of a process pool: every check runs here, at once, in this process (and its stand-in repository)."""

    def __enter__(self) -> Inline:
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def submit(self, check) -> Future:
        future: Future = Future()
        future.set_result(check())
        return future


class Main(Repository):
    def setUp(self) -> None:
        super().setUp()
        patch = mock.patch.object(crosscheck, "ProcessPoolExecutor", Inline)
        patch.start()
        self.addCleanup(patch.stop)
        self.write("ns/shapes/thing/v1.ttl", THING_V1)
        self.write("decks/a/v1.ttl", 'ex:a a dcat:Dataset ; dct:title "A" ; dct:isPartOf ex:series .')
        self.write("packages/vocab/fixtures/deck/v4/valid/pod.ttl", '<#deck> a dcat:Dataset ; dct:title "A deck" .')
        self.write("packages/vocab/fixtures/library-deck/v6/valid/release.ttl", '<#deck> a dcat:Dataset ; dct:title "A release" .')
        self.write("packages/vocab/fixtures/draft-deck/v1/valid/draft.ttl", '<#thing> a sm:Thing ; rdfs:label "A thing" .')
        self.write("packages/vocab/fixtures/fsrs-review-state/v1/valid/state.ttl", '<#state> a ex:State .')

    def run_main(self) -> tuple[int, str]:
        out = io.StringIO()
        with redirect_stdout(out):
            code = crosscheck.main()
        return code, out.getvalue()

    def test_passes_when_every_document_conforms(self) -> None:
        code, out = self.run_main()
        self.assertEqual(code, 0)
        for label in (
            "decks/index.ttl (DCAT-AP)",
            "decks/a/v1.ttl (DCAT-AP)",
            "a pod catalog document, deck/v4/valid/pod.ttl (DCAT-AP)",
            "a release in a pod, library-deck/v6/valid/release.ttl (DCAT-AP, no index)",
            "library-deck/v6/valid/release.ttl (Solid Memo's shapes, library)",
            "draft-deck/v1/valid/draft.ttl (Solid Memo's shapes, draft)",
            "fsrs-review-state/v1/valid/state.ttl (Solid Memo's shapes, pod)",
            "ns/vocab/v1.ttl (SKOS, best practice)",
            "ns/vocab/topics.ttl (SKOS, best practice)",
        ):
            self.assertIn(f"ok   {label}\n", out)
        self.assertTrue(out.endswith("9 of 9 documents conform.\n"))

    def test_fails_and_reports_each_document_that_does_not_conform(self) -> None:
        self.write("packages/vocab/fixtures/draft-deck/v1/valid/draft.ttl", "<#thing> a sm:Thing .")
        self.write("ns/vocab/topics.ttl", "ex:topic a skos:Concept .")
        code, out = self.run_main()
        self.assertEqual(code, 1)
        self.assertIn("FAIL draft-deck/v1/valid/draft.ttl (Solid Memo's shapes, draft)\n", out)
        self.assertIn("FAIL ns/vocab/topics.ttl (SKOS, best practice)\n", out)
        self.assertIn("Validation Report", out)
        self.assertTrue(out.endswith("7 of 9 documents conform.\n"))


class Install(unittest.TestCase):
    def test_says_how_to_install_pyshacl_if_it_is_missing(self) -> None:
        spec = importlib.util.spec_from_file_location("crosscheck_without_pyshacl", crosscheck.__file__)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        with mock.patch.dict(sys.modules, {"pyshacl": None}), self.assertRaises(SystemExit) as stop:
            spec.loader.exec_module(module)
        self.assertIn("pyshacl is not installed: pip install -r scripts/requirements-ci.txt", str(stop.exception.code))


if __name__ == "__main__":
    unittest.main()
