# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

"""Tests of scripts/wikidata_labels.py, with the standard library's unittest.

Each test builds a library of its own in a temporary folder: one deck, its
first version, v1.ttl, written by hand as the library's decks are, and its
mapping, with a fake Wikidata behind the script's one way out, fetch_json,
and git patched out, so they read nothing of the real repository and need no
network.

The deck has four cards, a country and its capital:
  - Sweden -> Stockholm: labels in every language;
  - Nauru -> Yaren: Yaren has no Korean label, so the card goes without
    Korean; and no German one but a "mul" label, which German takes;
  - Austria -> Vienna, a frame, "Capital of {0}", on the front;
  - Europe, skipped by the mapping;
and a retired card, which no mapping names.

Run:  npm run test:crosscheck  (or python3 -m unittest discover -s scripts)
"""

from __future__ import annotations

import io
import json
import sys
import tempfile
import textwrap
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

import wikidata_labels as wl

DECK = "capitals"
BASE = f"{wl.SITE}/{DECK}"

# QID -> revision -> its labels; the newest revision is the current one.
WIKIDATA: dict[str, dict[int, dict[str, str]]] = {
    "Q34": {100: {"en": "Sweden", "sv": "Sverige", "ko": "스웨덴", "de": "Schweden", "es": "Suecia",
                  "fr": "Suède"}},
    "Q1754": {200: {"en": "Stockholm", "sv": "Stockholm", "ko": "스톡홀름", "de": "Stockholm",
                    "es": "Estocolmo", "fr": "Stockholm"}},
    "Q697": {300: {"en": "Nauru", "sv": "Nauru", "ko": "나우루", "de": "Nauru", "es": "Nauru",
                   "fr": "Nauru"}},
    "Q36788": {400: {"en": "Yaren", "sv": "Yaren", "es": "Yaren", "fr": "Yaren", "mul": "Yaren"}},
    "Q40": {500: {"en": "Austria", "sv": "Österrike", "ko": "오스트리아", "de": "Österreich",
                  "es": "Austria", "fr": "Autriche"},
            501: {"en": "Austria", "sv": "Österrike", "ko": "오스트리아", "de": "Österreich",
                  "es": "Austria", "fr": "Autriche", "it": "Austria"}},
    "Q1741": {600: {"en": "Vienna", "sv": "Wien", "ko": "빈", "de": "Wien", "es": "Viena", "fr": "Vienne"}},
}

MAPPING = {
    "description": {lang: f"Countries and capitals ({lang})." for lang in ("en", "sv", "ko", "de", "es", "fr")},
    "frames": {"capital-of": {"en": "Capital of {0}", "sv": "Huvudstad i {0}", "ko": "{0}의 수도",
                              "de": "Hauptstadt von {0}", "es": "Capital de {0}", "fr": "Capitale de {0}"}},
    "labels": {"Capital": {"sv": "Huvudstad", "ko": "수도", "de": "Hauptstadt", "es": "Capital",
                           "fr": "Capitale"}},
    "cards": {
        "sweden": {"front": "{Q34}", "back": "{Q1754}"},
        "nauru": {"front": "{Q697}", "back": "{Q36788} (Yaren District)"},
        "austria": {"front": {"frame": "capital-of", "items": ["Q40"]}, "back": "{Q1741}"},
        "europe": {"skip": "a continent, not a country"},
    },
}

FIRST = f"""\
@base <{BASE}/v1.ttl> .

@prefix solid-memo: <https://solid-memo.com/ns/vocab/v1.ttl#> .
@prefix dcterms:    <http://purl.org/dc/terms/> .
@prefix xsd:        <http://www.w3.org/2001/XMLSchema#> .
@prefix dcat:       <http://www.w3.org/ns/dcat#> .
@prefix foaf:       <http://xmlns.com/foaf/0.1/> .
@prefix owl:        <http://www.w3.org/2002/07/owl#> .
@prefix adms:       <http://www.w3.org/ns/adms#> .

<>
    a solid-memo:Deck ,
      dcat:Dataset ;
    dcterms:title "Capitals"@en ,
                  "Huvudstäder"@sv ;
    dcterms:creator <#anton-wiklund> ;
    dcterms:description "Countries and capitals, in English and Swedish."@en ,
                        "Länder och huvudstäder, på engelska och svenska."@sv ;
    dcterms:modified "2026-09-01T00:00:00Z"^^xsd:dateTime ;
    dcterms:language <http://publications.europa.eu/resource/authority/language/ENG> ,
                     <http://publications.europa.eu/resource/authority/language/SWE> ;
    solid-memo:formatVersion 5 ;
    dcat:version "1" ;
    dcterms:issued "2026-09-01T00:00:00Z"^^xsd:dateTime ;
    adms:versionNotes "First release." ;
    dcat:distribution <#turtle> .

<#anton-wiklund>
    a foaf:Agent ;
    foaf:name "Anton Wiklund" ;
    foaf:mbox <mailto:anton@example.org> .

# Comments stay with their subject.
<#sweden>
    a solid-memo:Card ;
    solid-memo:formatVersion 6 ;
    solid-memo:backLabel "Capital"@en ,
                         "Huvudstad"@sv ;
    dcterms:created "2026-09-01T00:00:00.000Z"^^xsd:dateTime ;
    solid-memo:front "Sweden"@en ,
                     "Sverige"@sv ;
    solid-memo:back "Stockholm"@en ,
                    "Stockholm"@sv .

<#nauru>
    a solid-memo:Card ;
    solid-memo:formatVersion 4 ;
    solid-memo:front "Nauru"@en ,
                     "Nauru"@sv ;
    solid-memo:back "Yaren (de facto)"@en ,
                    "Yaren"@sv ;
    solid-memo:backNote "No official capital."@en ,
                        "Ingen officiell huvudstad."@sv .

<#austria>
    a solid-memo:Card ;
    solid-memo:formatVersion 4 ;
    solid-memo:front "Capital of Austria"@en ,
                     "Huvudstad i Österrike"@sv ;
    solid-memo:back "Vienna"@en ,
                    "Wien"@sv .

<#europe>
    a solid-memo:Card ;
    solid-memo:formatVersion 4 ;
    solid-memo:front "Europe"@en ;
    solid-memo:back "-"@zxx .

<#old>
    a solid-memo:Card ;
    solid-memo:formatVersion 4 ;
    owl:deprecated true ;
    solid-memo:front "Old"@en ;
    solid-memo:back "Gone"@en .

<#turtle>
    a dcat:Distribution ;
    dcat:downloadURL <> .
"""


class FakeWikidata:
    """The Action API, as far as the script asks it: wbgetentities and the
    revisions query."""

    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []

    def __call__(self, params: dict[str, str]) -> dict:
        self.calls.append(params)
        if params["action"] == "wbgetentities":
            entities = {}
            for qid in params["ids"].split("|"):
                if qid not in WIKIDATA:
                    entities[qid] = {"id": qid, "missing": ""}
                    continue
                revision = max(WIKIDATA[qid])
                entities[qid] = {"id": qid, "lastrevid": revision, "labels": self.labels(qid, revision, params)}
            return {"entities": entities}
        revids = [int(r) for r in params["revids"].split("|")]
        pages = []
        for qid, revisions in WIKIDATA.items():
            for revision in revisions:
                if revision in revids:
                    content = {"id": qid, "labels": self.labels(qid, revision, None)}
                    pages.append({"title": qid, "revisions": [
                        {"revid": revision, "slots": {"main": {"content": json.dumps(content)}}}]})
        return {"query": {"pages": pages}}

    @staticmethod
    def labels(qid: str, revision: int, params: dict[str, str] | None) -> dict:
        wanted = params["languages"].split("|") if params else None
        return {lang: {"language": lang, "value": value} for lang, value in WIKIDATA[qid][revision].items()
                if wanted is None or lang in wanted}


class Library(unittest.TestCase):
    """A test with a deck, a mapping and a Wikidata of its own."""

    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.decks = self.root / "decks"
        self.mappings = self.root / "mappings"
        (self.decks / DECK).mkdir(parents=True)
        self.mappings.mkdir()
        self.v1 = self.decks / DECK / "v1.ttl"
        self.v1.write_text(FIRST, encoding="utf-8")
        self.write_mapping(MAPPING)
        self.cache = self.root / "cache"
        self.wikidata = FakeWikidata()
        for name, value in (("DECKS", self.decks), ("MAPPINGS", self.mappings), ("ROOT", self.root),
                            ("fetch_json", self.wikidata)):
            patch = mock.patch.object(wl, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        # git is not asked: the script is taken as not committed, wherever the tests run.
        patch = mock.patch.object(wl.subprocess, "run", side_effect=OSError("no git in the tests"))
        patch.start()
        self.addCleanup(patch.stop)

    def write_mapping(self, mapping: dict) -> None:
        (self.mappings / f"{DECK}.json").write_text(json.dumps(mapping, ensure_ascii=False, indent=2),
                                                    encoding="utf-8")

    def run_script(self, *args: str) -> tuple[str, str]:
        """Runs main() with these options, returning what it printed and what it reported."""
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(sys, "argv", ["wikidata_labels.py", *args]), redirect_stdout(out), \
                redirect_stderr(err):
            wl.main()
        return out.getvalue(), err.getvalue()

    def make_v2(self, *more: str) -> str:
        self.notes_file = self.root / "notes.txt"
        _, self.report = self.run_script("--deck", DECK, "--issued", "2026-11-02", "--allow-uncommitted",
                                         "--cache-dir", str(self.cache), "--notes-file", str(self.notes_file),
                                         *more)
        return (self.decks / DECK / "v2.ttl").read_text(encoding="utf-8")

    def block(self, text: str, subject: str) -> str:
        """A subject's block, as written, from its first line to the empty line after it."""
        start = text.index(f"\n{subject}\n") + 1
        end = text.find("\n\n", start)
        return text[start:end if end >= 0 else len(text)]


class Turtle(Library):
    def test_reads_and_writes_a_version_back_byte_for_byte(self) -> None:
        text = self.v1.read_text(encoding="utf-8")
        self.assertEqual(wl.parse(text, "v1").text(), text)

    def test_refuses_a_long_string(self) -> None:
        with self.assertRaises(SystemExit) as stop:
            wl.parse('@base <x> .\n\n<>\n    rdfs:comment """a\nb""" .\n', "x")
        self.assertIn("long string", str(stop.exception.code))

    def test_refuses_a_line_it_cannot_read(self) -> None:
        with self.assertRaises(SystemExit) as stop:
            wl.parse("@base <x> .\n\n<>\n  a b .\n", "x")
        self.assertIn("cannot read the line", str(stop.exception.code))

    def test_reads_turtle_escapes(self) -> None:
        self.assertEqual(wl.literal(r'"a \"b\" é\n"@en'), ('a "b" é\n', "en"))
        self.assertIsNone(wl.literal("<#x>"))


class NextVersion(Library):
    def setUp(self) -> None:
        super().setUp()
        self.text = self.make_v2()

    def test_is_the_next_version_of_the_deck(self) -> None:
        deck = self.block(self.text, "<>")
        self.assertTrue(self.text.startswith(f"@base <{BASE}/v2.ttl> .\n"))
        for line in ('    dcat:version "2" ;', f"    dcat:prev <{BASE}/v1.ttl> ;",
                     f"    dcat:previousVersion <{BASE}/v1.ttl> ;",
                     '    dcterms:issued "2026-11-02T00:00:00Z"^^xsd:dateTime ;',
                     '    dcterms:modified "2026-11-02T00:00:00Z"^^xsd:dateTime ;',
                     "    solid-memo:formatVersion 6 ;", "    dcat:contactPoint <#contact> ;"):
            self.assertIn(line + "\n", deck)

    def test_names_the_issues_as_its_contact_and_no_email(self) -> None:
        self.assertIn(f"<#contact>\n    a vcard:Kind ;\n    vcard:hasURL <{wl.CONTACT}> .", self.text)
        self.assertNotIn("foaf:mbox", self.text)
        self.assertIn('<#anton-wiklund>\n    a foaf:Agent ;\n    foaf:name "Anton Wiklund" .\n\n<#contact>',
                      self.text)

    def test_declares_the_prefixes_it_writes_aligned(self) -> None:
        self.assertIn("@prefix solid-memo: <https://solid-memo.com/ns/vocab/v1.ttl#> .\n", self.text)
        self.assertIn("@prefix spdx:       <http://spdx.org/rdf/terms#> .\n", self.text)
        self.assertIn("@prefix vcard:      <http://www.w3.org/2006/vcard/ns#> .\n", self.text)

    def test_takes_the_description_from_the_mapping(self) -> None:
        deck = self.block(self.text, "<>")
        self.assertIn('dcterms:description "Countries and capitals (en)."@en ,\n'
                      '                        "Countries and capitals (sv)."@sv ,\n'
                      '                        "Countries and capitals (ko)."@ko ,', deck)

    def test_states_the_languages_its_cards_gained(self) -> None:
        self.assertIn("    dcterms:language <http://publications.europa.eu/resource/authority/language/ENG> ,\n"
                      "                     <http://publications.europa.eu/resource/authority/language/SWE> ,\n"
                      "                     <http://publications.europa.eu/resource/authority/language/KOR> ,\n"
                      "                     <http://publications.europa.eu/resource/authority/language/DEU> ,",
                      self.text)

    def test_gives_a_card_every_language_wikidata_has(self) -> None:
        self.assertEqual(self.block(self.text, "<#sweden>"), textwrap.dedent("""\
            <#sweden>
                a solid-memo:Card ;
                solid-memo:formatVersion 6 ;
                solid-memo:backLabel "Capital"@en ,
                                     "Huvudstad"@sv ,
                                     "수도"@ko ,
                                     "Hauptstadt"@de ,
                                     "Capital"@es ,
                                     "Capitale"@fr ;
                dcterms:created "2026-09-01T00:00:00.000Z"^^xsd:dateTime ;
                dcterms:subject <http://www.wikidata.org/entity/Q34> ,
                                <http://www.wikidata.org/entity/Q1754> ;
                solid-memo:front "Sweden"@en ,
                                 "Sverige"@sv ,
                                 "스웨덴"@ko ,
                                 "Schweden"@de ,
                                 "Suecia"@es ,
                                 "Suède"@fr ;
                solid-memo:back "Stockholm"@en ,
                                "Stockholm"@sv ,
                                "스톡홀름"@ko ,
                                "Stockholm"@de ,
                                "Estocolmo"@es ,
                                "Stockholm"@fr ."""))
        self.assertTrue(self.text.find("# Comments stay with their subject.\n<#sweden>") > 0)

    def test_goes_without_a_language_an_item_has_no_label_in_and_takes_mul_but_for_korean(self) -> None:
        nauru = self.block(self.text, "<#nauru>")
        self.assertNotIn("@ko", nauru)
        self.assertIn('"Yaren (Yaren District)"@de ,', nauru)
        self.assertIn('"Nauru"@de ,', nauru)
        self.assertIn('"Yaren (de facto)"@en ,', nauru)
        self.assertIn('dcterms:subject <http://www.wikidata.org/entity/Q697> ,', nauru)
        self.assertIn("    solid-memo:formatVersion 4 ;\n    dcterms:subject", nauru)
        self.assertIn('solid-memo:backNote "No official capital."@en ,\n'
                      '                        "Ingen officiell huvudstad."@sv .', nauru)
        self.assertIn("nauru: no Korean label for Q36788 (Yaren)", self.report)

    def test_makes_a_frame_in_each_language(self) -> None:
        austria = self.block(self.text, "<#austria>")
        for text in ('"Capital of Austria"@en', '"Huvudstad i Österrike"@sv', '"오스트리아의 수도"@ko',
                     '"Hauptstadt von Österreich"@de', '"Capital de Austria"@es', '"Capitale de Autriche"@fr'):
            self.assertIn(text, austria)

    def test_leaves_skipped_and_retired_cards_as_they_were(self) -> None:
        first = self.v1.read_text(encoding="utf-8")
        for card in ("<#europe>", "<#old>"):
            self.assertEqual(self.block(self.text, card), self.block(first, card))
        self.assertIn("europe: a continent, not a country", self.report)

    def test_reports_english_or_swedish_text_that_differs_from_wikidata(self) -> None:
        self.assertIn("nauru, back, en: 'Yaren (de facto)' on the card, 'Yaren (Yaren District)' from Wikidata",
                      self.report)
        self.assertNotIn("sweden,", self.report.split("DIFFERS")[1])

    def test_records_the_revisions_it_read_the_mapping_and_the_script(self) -> None:
        activity = self.block(self.text, wl.ACTIVITY)
        self.assertIn(f"prov:used <{BASE}/v1.ttl> ,\n              <#wikidata-mapping> ,\n"
                      "              <https://www.wikidata.org/wiki/Special:EntityData/Q34.json?revision=100> ,",
                      activity)
        self.assertIn("Q40.json?revision=501>", activity)
        self.assertNotIn("Q999", activity)
        self.assertIn(f"prov:wasAssociatedWith <{wl.REPO_URL}/blob/main/", activity)
        self.assertIn("--deck capitals --issued 2026-11-02 (Python", activity)
        self.assertNotIn("--cache-dir", activity)
        self.assertEqual(wl.recorded(wl.parse(self.text, "v2"))[1],
                         wl.load_mapping(DECK).sha256)
        self.assertIn("prov:wasGeneratedBy <#wikidata-labels> ;", self.text)
        self.assertIn("prov:wasDerivedFrom <https://www.wikidata.org/> ;", self.text)
        self.assertIn('<https://www.wikidata.org/>\n    dcterms:title "Wikidata" ;', self.text)

    def test_writes_the_notes(self) -> None:
        notes = self.notes_file.read_text(encoding="utf-8").strip()
        self.assertEqual(notes, (
            "Card text in Korean, German, Spanish and French as well, from Wikidata's labels of what each card "
            "names: of the 4 cards in use, 2 in Korean, 3 in German, 3 in Spanish, 3 in French; English and "
            "Swedish text unchanged. Each card names the Wikidata items it is about (dcterms:subject). 3 cards "
            "are made from Wikidata; 1 are not, as the mapping says why. The deck names the project's issue "
            "tracker as its contact, and no email."))
        self.assertIn(f"adms:versionNotes {wl.ttl_str(notes)} ;", self.text)

    def test_a_later_version_replaces_how_it_was_made(self) -> None:
        WIKIDATA["Q36788"][401] = {**WIKIDATA["Q36788"][400], "ko": "야렌"}
        self.addCleanup(WIKIDATA["Q36788"].pop, 401)
        self.run_script("--deck", DECK, "--issued", "2026-12-01", "--allow-uncommitted")
        v3 = (self.decks / DECK / "v3.ttl").read_text(encoding="utf-8")
        self.assertEqual(v3.count(f"\n{wl.ACTIVITY}\n"), 1)
        self.assertEqual(v3.count("\n<#contact>\n"), 1)
        self.assertEqual(v3.count('dcterms:title "wikidata_labels.py"'), 1)
        self.assertEqual(v3.count("prov:wasGeneratedBy <#wikidata-labels> ;"), 1)
        self.assertIn('"야렌 (Yaren District)"@ko', v3)
        self.assertEqual(self.block(v3, "<#sweden>"), self.block(self.text, "<#sweden>"))
        self.assertIn(f"dcat:prev <{BASE}/v2.ttl> ;", v3)


class Verify(Library):
    def setUp(self) -> None:
        super().setUp()
        self.make_v2()
        self.v2 = self.decks / DECK / "v2.ttl"
        self.cache = self.root / "fresh-cache"

    def test_passes_when_the_cards_come_out_the_same(self) -> None:
        _, err = self.run_script("--verify")
        self.assertIn("v2.ttl of capitals: its 5 cards come out byte for byte the same from 6 Wikidata "
                      "revisions", err)

    def test_reads_an_older_revision_of_an_item_edited_since(self) -> None:
        WIKIDATA["Q40"][502] = {**WIKIDATA["Q40"][501], "fr": "Autriche (pays)"}
        self.addCleanup(WIKIDATA["Q40"].pop, 502)
        self.wikidata.calls.clear()
        _, err = self.run_script("--verify", "--cache-dir", str(self.cache))
        self.assertIn("come out byte for byte the same", err)
        self.assertEqual([c["revids"] for c in self.wikidata.calls if c["action"] == "query"], ["501"])
        self.assertTrue((self.cache / "Q40-501.json").exists())
        self.wikidata.calls.clear()
        self.run_script("--verify", "--cache-dir", str(self.cache))
        self.assertEqual(self.wikidata.calls, [], "every revision kept, nothing fetched")

    def test_fails_when_a_card_says_something_else(self) -> None:
        text = self.v2.read_text(encoding="utf-8")
        self.v2.write_text(text.replace('"Estocolmo"@es', '"Stockholm"@es'), encoding="utf-8")
        with self.assertRaises(SystemExit) as stop, redirect_stderr(io.StringIO()) as err:
            with mock.patch.object(sys, "argv", ["wikidata_labels.py", "--verify", "--deck", DECK]):
                wl.main()
        self.assertEqual(stop.exception.code, "not the same: capitals")
        self.assertRegex(err.getvalue(), r'\n- +"Stockholm"@es ,\n')
        self.assertRegex(err.getvalue(), r'\n\+ +"Estocolmo"@es ,\n')

    def test_fails_when_the_mapping_has_changed(self) -> None:
        self.write_mapping({**MAPPING, "untranslated": ["zxx"]})
        with self.assertRaises(SystemExit), redirect_stderr(io.StringIO()) as err:
            with mock.patch.object(sys, "argv", ["wikidata_labels.py", "--verify"]):
                wl.main()
        self.assertIn("was made with another mapping", err.getvalue())

    def test_warns_and_passes_when_wikidata_cannot_be_reached(self) -> None:
        with mock.patch.object(wl, "fetch_json", side_effect=wl.Unreachable("HTTP 503, after 5 tries")), \
                mock.patch.dict("os.environ", {"GITHUB_ACTIONS": "true"}):
            out, err = self.run_script("--verify")
        self.assertIn("capitals not verified: Wikidata could not be reached (HTTP 503, after 5 tries)", err)
        self.assertIn("::warning::capitals not verified", out)

    def test_says_so_of_a_deck_the_script_has_not_made_a_version_of(self) -> None:
        self.v2.unlink()
        _, err = self.run_script("--verify")
        self.assertIn("capitals: no version was made by this script yet", err)


class Untranslated(Library):
    def test_a_label_that_is_the_cards_untranslated_name_is_no_translation(self) -> None:
        self.v1.write_text(self.v1.read_text(encoding="utf-8").replace(
            '"Stockholm"@sv .', '"Stockholm"@sv ,\n                    "Schweden"@la .'), encoding="utf-8")
        self.write_mapping({**MAPPING, "untranslated": ["la"]})
        text = self.make_v2()
        self.assertNotIn('"Schweden"@de', self.block(text, "<#sweden>"))
        self.assertIn('"Suecia"@es', self.block(text, "<#sweden>"))
        self.assertIn("sweden: the German label is the untranslated name 'Schweden'", self.report)


class Refused(Library):
    def test_a_card_goes_without_a_language_whose_label_the_mapping_refuses(self) -> None:
        cards = {**MAPPING["cards"], "sweden": {**MAPPING["cards"]["sweden"], "not": {"es": ["Estocolmo"]}}}
        self.write_mapping({**MAPPING, "cards": cards})
        sweden = self.block(self.make_v2(), "<#sweden>")
        self.assertNotIn("@es", sweden)
        self.assertIn('"Stockholm"@fr', sweden)
        self.assertIn("sweden: the mapping refuses the Spanish label 'Estocolmo' of Q1754 (Stockholm)", self.report)

    def test_a_refused_mul_label_is_refused_too(self) -> None:
        cards = {**MAPPING["cards"], "nauru": {**MAPPING["cards"]["nauru"], "not": {"de": ["Yaren"]}}}
        self.write_mapping({**MAPPING, "cards": cards})
        nauru = self.block(self.make_v2(), "<#nauru>")
        self.assertNotIn("@de", nauru)
        self.assertIn('"Yaren (Yaren District)"@es', nauru)

    def test_refuses_a_not_that_is_no_list_of_labels_by_language(self) -> None:
        cards = {**MAPPING["cards"], "sweden": {**MAPPING["cards"]["sweden"], "not": {"it": ["x"], "es": "x"}}}
        self.write_mapping({**MAPPING, "cards": cards})
        with self.assertRaises(SystemExit) as stop, redirect_stderr(io.StringIO()):
            self.run_script("--deck", DECK, "--allow-uncommitted")
        self.assertIn("card 'sweden': its \"not\" gives no list of labels by language", str(stop.exception.code))


class Refusals(Library):
    def refused(self, *args: str) -> str:
        with self.assertRaises(SystemExit) as stop, redirect_stderr(io.StringIO()):
            self.run_script(*args)
        return str(stop.exception.code)

    def test_refuses_a_mapping_that_misses_a_card_or_names_one_not_in_use(self) -> None:
        cards = {k: v for k, v in MAPPING["cards"].items() if k != "europe"}
        self.write_mapping({**MAPPING, "cards": {**cards, "old": {"skip": "retired"}}})
        message = self.refused("--deck", DECK, "--allow-uncommitted")
        self.assertIn("card 'europe' is not in the mapping", message)
        self.assertIn("card 'old' is not in use in the deck", message)

    def test_refuses_a_card_label_the_mapping_does_not_translate(self) -> None:
        self.write_mapping({**MAPPING, "labels": {}})
        self.assertIn("its back label 'Capital' is not in the mapping's labels",
                      self.refused("--deck", DECK, "--allow-uncommitted"))

    def test_refuses_a_mapping_that_is_not_complete(self) -> None:
        self.write_mapping({**MAPPING, "description": {"en": "x"}, "frames": {"f": {"en": "{0}"}},
                            "labels": {"Capital": {"sv": "Huvudstad"}},
                            "cards": {"a": {"front": "Sweden"}, "b": {"back": {"frame": "g", "items": []}},
                                      "c": {"front": {"frame": "f", "items": ["Sweden"]}}, "d": {}}})
        message = self.refused("--deck", DECK, "--allow-uncommitted")
        for problem in ("the description has no 'sv'", "frame 'f' has no 'ko'", "label 'Capital' has no 'ko'",
                        "card 'a': its front names no item", "card 'b': its back names no frame",
                        "card 'c': its front's items are not QIDs", "card 'd': give its front"):
            self.assertIn(problem, message)

    def test_refuses_a_deck_without_a_mapping(self) -> None:
        (self.mappings / f"{DECK}.json").unlink()
        self.assertIn("the deck has no mapping yet", self.refused("--deck", DECK, "--allow-uncommitted"))

    def test_refuses_an_item_wikidata_no_longer_has(self) -> None:
        self.write_mapping({**MAPPING, "cards": {**MAPPING["cards"], "sweden": {"front": "{Q999}"}}})
        self.assertIn("Q999: no such item", self.refused("--deck", DECK, "--allow-uncommitted"))

    def test_refuses_without_allow_uncommitted_when_the_script_is_not_committed(self) -> None:
        self.assertIn("is not committed and unmodified at HEAD", self.refused("--deck", DECK))

    def test_refuses_a_date_that_is_not_one(self) -> None:
        with redirect_stderr(io.StringIO()):
            self.assertEqual(self.refused("--deck", DECK, "--issued", "soon"), "2")

    def test_asks_for_one_deck_to_make(self) -> None:
        with redirect_stderr(io.StringIO()):
            self.assertEqual(self.refused("--allow-uncommitted"), "2")

    def test_says_when_wikidata_cannot_be_reached(self) -> None:
        with mock.patch.object(wl, "fetch_json", side_effect=wl.Unreachable("timed out")):
            self.assertEqual(self.refused("--deck", DECK, "--allow-uncommitted"),
                             "Wikidata could not be reached: timed out")


class ScriptProvenance(unittest.TestCase):
    def test_names_the_commit_that_last_changed_the_script(self) -> None:
        answers = {"rev-parse": "/repo", "log": "abc123", "ls-files": "scripts/wikidata_labels.py", "status": ""}

        def git(args: list[str], **_: object) -> mock.Mock:
            return mock.Mock(stdout=answers[args[1]] + "\n")
        with mock.patch.object(wl.subprocess, "run", side_effect=git) as run, \
                mock.patch.object(wl.os.path, "relpath", return_value="scripts/wikidata_labels.py"):
            made = wl.script_provenance(False, ["--deck", "x"])
        self.assertEqual(made.commit, "abc123")
        self.assertEqual(made.script_url, f"{wl.REPO_URL}/blob/abc123/scripts/wikidata_labels.py")
        self.assertEqual(made.command, "python3 scripts/wikidata_labels.py --deck x")
        log = next(c.args[0] for c in run.call_args_list if c.args[0][1] == "log")
        self.assertEqual(log[:4], ["git", "log", "-1", "--format=%H"])

    def test_names_no_commit_when_the_script_is_changed(self) -> None:
        answers = {"rev-parse": "/repo", "log": "abc123", "ls-files": "x", "status": " M scripts/wikidata_labels.py"}
        with mock.patch.object(wl.subprocess, "run",
                               side_effect=lambda args, **_: mock.Mock(stdout=answers[args[1]])), \
                redirect_stderr(io.StringIO()):
            self.assertIsNone(wl.script_provenance(True, []).commit)


class Response(io.BytesIO):
    """What urlopen returns, as far as fetch_json reads it."""

    def __init__(self, data: object, headers: dict[str, str] | None = None) -> None:
        super().__init__(json.dumps(data).encode())
        self.headers = headers or {}


class FetchJson(unittest.TestCase):
    def error(self, code: int, headers: dict[str, str] | None = None) -> urllib.error.HTTPError:
        error = urllib.error.HTTPError(wl.API, code, "an error", headers or {}, io.BytesIO())  # type: ignore
        self.addCleanup(error.close)
        return error

    def fetch(self, *answers: object) -> tuple[object, mock.Mock, mock.Mock, str]:
        urlopen = mock.Mock(side_effect=list(answers))
        with mock.patch("urllib.request.urlopen", urlopen), mock.patch("time.sleep") as sleep, \
                redirect_stderr(io.StringIO()) as err:
            try:
                result: object = wl.fetch_json({"action": "wbgetentities", "ids": "Q1"})
            except wl.Unreachable as error:
                result = error
        return result, urlopen, sleep, err.getvalue()

    def test_asks_politely(self) -> None:
        result, urlopen, sleep, _ = self.fetch(Response({"entities": {}}))
        self.assertEqual(result, {"entities": {}})
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("User-agent"), wl.USER_AGENT)
        self.assertEqual(request.get_header("Accept-encoding"), "gzip")
        self.assertNotIn("maxlag", request.full_url)
        self.assertIn("ids=Q1", request.full_url)
        sleep.assert_not_called()

    def test_reads_a_gzipped_answer(self) -> None:
        import gzip
        answer = io.BytesIO(gzip.compress(b'{"ok": 1}'))
        answer.headers = {"Content-Encoding": "gzip"}  # type: ignore[attr-defined]
        self.assertEqual(self.fetch(answer)[0], {"ok": 1})

    def test_tries_again_after_a_server_error_or_too_many_requests(self) -> None:
        result, urlopen, sleep, err = self.fetch(self.error(503), self.error(429, {"Retry-After": "60"}),
                                                 Response([1]))
        self.assertEqual(result, [1])
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [wl.RETRY_AFTER[0], 60])
        self.assertIn("HTTP 503; trying again in", err)

    def test_tries_again_when_the_server_cannot_be_reached(self) -> None:
        result, *_ = self.fetch(urllib.error.URLError("timed out"), Response([1]))
        self.assertEqual(result, [1])

    def test_gives_up_after_the_last_try(self) -> None:
        result, urlopen, sleep, _ = self.fetch(*[self.error(503)] * (len(wl.RETRY_AFTER) + 1))
        self.assertIsInstance(result, wl.Unreachable)
        self.assertEqual(str(result), f"HTTP 503, after {len(wl.RETRY_AFTER) + 1} tries")
        self.assertEqual([c.args[0] for c in sleep.call_args_list], list(wl.RETRY_AFTER))

    def test_does_not_try_again_after_a_client_error_or_an_error_answer(self) -> None:
        result, urlopen, sleep, _ = self.fetch(self.error(404))
        self.assertEqual(str(result), f"HTTP 404 from {wl.API}")
        result, *_ = self.fetch(Response({"error": {"code": "badvalue", "info": "No such action."}}))
        self.assertEqual(str(result), "Wikidata answered badvalue: No such action.")
        sleep.assert_not_called()


class Current(unittest.TestCase):
    def test_refuses_an_item_that_is_now_a_redirect(self) -> None:
        answer = {"entities": {"Q1": {"id": "Q2", "lastrevid": 1, "redirects": {"from": "Q1", "to": "Q2"}}}}
        with mock.patch.object(wl, "fetch_json", return_value=answer), redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit) as stop:
                wl.current(["Q1"], None)
        self.assertIn("Q1: now a redirect to Q2", str(stop.exception.code))

    def test_says_wikidata_could_not_be_reached_on_an_unexpected_answer(self) -> None:
        with mock.patch.object(wl, "fetch_json", return_value={"what": 1}), redirect_stderr(io.StringIO()):
            with self.assertRaises(wl.Unreachable):
                wl.current(["Q1"], None)

    def test_refuses_a_revision_that_is_not_a_number(self) -> None:
        for revision in ("9/../x", 9.5, True, None):
            answer = {"entities": {"Q1": {"id": "Q1", "lastrevid": revision, "labels": {}}}}
            with self.subTest(revision=revision), mock.patch.object(wl, "fetch_json", return_value=answer), \
                    redirect_stderr(io.StringIO()):
                with self.assertRaises(wl.Unreachable) as raised:
                    wl.current(["Q1"], None)
                self.assertTrue(str(raised.exception).startswith("unexpected revision of Q1: "))

    def test_says_so_when_an_old_revision_cannot_be_read(self) -> None:
        answers = [{"entities": {"Q1": {"id": "Q1", "lastrevid": 9, "labels": {}}}}, {"query": {"pages": []}}]
        with mock.patch.object(wl, "fetch_json", side_effect=answers), redirect_stderr(io.StringIO()):
            with self.assertRaises(wl.Unreachable) as raised:
                wl.at_revisions({"Q1": 8}, None)
        self.assertEqual(str(raised.exception), "revision 8 of Q1 could not be read")

    def test_takes_labels_in_nfc(self) -> None:
        entity = {"labels": {"fr": {"value": " Amérique "}, "it": {"value": "x"}}}
        self.assertEqual(wl.labels_of(entity), {"fr": "Amérique"})


if __name__ == "__main__":
    unittest.main()
