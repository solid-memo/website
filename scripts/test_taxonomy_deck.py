# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

"""Tests of scripts/taxonomy_deck.py, with the standard library's unittest.

Each test builds a deck of its own in a temporary folder: a fake labour
market taxonomy of four versions and a handful of occupation names, kept as
the snapshots --cache-dir reads, and the deck's first version, v1.ttl,
covering the taxonomy's versions 1 to 3, with a header written by hand and
the cards the script's own functions make. The tests run the script on it
(--check, --verify, making v2.ttl from version 4), with the taxonomy's list
of versions, every download and git patched out, so they read nothing of
the real repository and need no network.

The fake taxonomy:
  - Aktiemäklare is replaced by a new concept, Finansmäklare, in version 3;
  - Motorman is renamed to Maskinskötare in version 2;
  - Hamnarbetare goes out of use in version 2, with nothing replacing it,
    and is taken back into use in version 4, so v2.ttl retires its card;
  - Dataskyddsombud is a new occupation in version 4;
  - Kock never changes, so it is never a card.

Each card names the concepts it is about (dcterms:subject), and Aktiemäklare's
concept the one replacing it (dcterms:isReplacedBy).

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

import taxonomy_deck as td

# Taxonomy version -> when it was published, as the API's versions list has it.
VERSIONS = {
    1: "2021-03-05T13:38:02.440Z",
    2: "2022-01-10T08:00:00.000Z",
    3: "2023-06-01T09:30:00.000Z",
    4: "2024-09-02T10:15:30.500Z",
}

# Taxonomy version -> its occupation names, as (id, label, deprecated, replaced by).
LIVE, GONE = False, True
TAXONOMY = {
    1: [("aktie", "Aktiemäklare", LIVE, []),
        ("hamn", "Hamnarbetare", LIVE, []),
        ("kock", "Kock", LIVE, []),
        ("motor", "Motorman", LIVE, [])],
    2: [("aktie", "Aktiemäklare", LIVE, []),
        ("hamn", "Hamnarbetare", GONE, []),
        ("kock", "Kock", LIVE, []),
        ("motor", "Maskinskötare", LIVE, [])],
    3: [("aktie", "Aktiemäklare", GONE, ["finans"]),
        ("finans", "Finansmäklare", LIVE, []),
        ("hamn", "Hamnarbetare", GONE, []),
        ("kock", "Kock", LIVE, []),
        ("motor", "Maskinskötare", LIVE, [])],
    4: [("aktie", "Aktiemäklare", GONE, ["finans"]),
        ("data", "Dataskyddsombud", LIVE, []),
        ("finans", "Finansmäklare", LIVE, []),
        ("hamn", "Hamnarbetare", LIVE, []),
        ("kock", "Kock", LIVE, []),
        ("motor", "Maskinskötare", LIVE, [])],
}


def api_answer(version: int) -> dict:
    """A version's concepts in the shape of the GraphQL API's answer."""
    labels = {cid: label for cid, label, _, _ in TAXONOMY[version]}
    return {"data": {"concepts": [
        {"id": cid, "preferred_label": label, "deprecated": deprecated,
         "replaced_by": [{"id": r, "preferred_label": labels[r]} for r in replaced_by]}
        for cid, label, deprecated, replaced_by in TAXONOMY[version]
    ]}}


# What a new version carries over from the one before it, verbatim: the deck's
# title, description and keywords, aligned under their predicate.
TITLE = """\
"Occupation names, new and changed"@en ,
                  "Yrkesbenämningar, nya och ändrade"@sv ,
                  "새 직업명과 바뀐 직업명"@ko ,
                  "Neue und geänderte Berufsbezeichnungen"@de ,
                  "Nombres de ocupaciones nuevos y modificados"@es ,
                  "Intitulés de métiers nouveaux et modifiés"@fr"""
DESCRIPTION = """\
"Occupation names that are new or have changed, with \\"what they are today\\"."@en ,
                        "Yrkesbenämningar som är nya eller har ändrats."@sv ,
                        "새로 생기거나 바뀐 직업명."@ko ,
                        "Berufsbezeichnungen, die neu sind oder sich geändert haben."@de ,
                        "Nombres de ocupaciones nuevos o modificados."@es ,
                        "Les intitulés de métiers nouveaux ou modifiés."@fr"""
KEYWORDS = """\
"occupations"@en ,
                 "Sweden"@en ,
                 "yrken"@sv ,
                 "Sverige"@sv ,
                 "직업"@ko ,
                 "스웨덴"@ko ,
                 "Berufe"@de ,
                 "Schweden"@de ,
                 "ocupaciones"@es ,
                 "Suecia"@es ,
                 "métiers"@fr ,
                 "Suède"@fr"""
REVIEW = """\
<#review-0>
    a prov:Activity ;
    prov:endedAtTime "2026-10-10T00:00:00Z"^^xsd:dateTime ;
    rdfs:label "Version 1: the texts in six languages"@en ;
    rdfs:comment "Scope: the title, description and keywords."@en ,
                 "Outcome: no card changed."@en ."""

BASE = f"{td.SITE}/{td.DECK}"


def first_version() -> str:
    """The deck's v1.ttl: a header as a person would write it, then what the
    script itself writes for taxonomy versions 1 to 3, so that v1 is what
    the script makes of them."""
    snaps, checksums = {}, {}
    for v in (1, 2, 3):
        concepts = api_answer(v)["data"]["concepts"]
        snaps[v] = {c["id"]: td.Concept(c["id"], c["preferred_label"], c["deprecated"],
                                        sorted(r["id"] for r in c["replaced_by"]))
                    for c in concepts}
        checksums[v] = td.checksum(concepts)
    cards, _, _ = td.build_cards(snaps, 2, 3)
    header = f"""\
        @base <{BASE}/v1.ttl> .

        @prefix solid-memo: <https://solid-memo.com/ns/vocab/v1.ttl#> .
        @prefix dcterms:    <http://purl.org/dc/terms/> .
        @prefix prov:       <http://www.w3.org/ns/prov#> .
        @prefix rdfs:       <http://www.w3.org/2000/01/rdf-schema#> .
        @prefix xsd:        <http://www.w3.org/2001/XMLSchema#> .
        @prefix dcat:       <http://www.w3.org/ns/dcat#> .
        @prefix foaf:       <http://xmlns.com/foaf/0.1/> .
        @prefix owl:        <http://www.w3.org/2002/07/owl#> .
        @prefix spdx:       <http://spdx.org/rdf/terms#> .

        <>
            a solid-memo:Deck ,
              dcat:Dataset ;
            dcterms:title {{title}} ;
            dcterms:creator <#anton-wiklund> ;
            dcterms:description {{description}} ;
            dcat:keyword {{keywords}} ;
            solid-memo:formatVersion 5 ;
            dcat:version "1" ;
            prov:wasGeneratedBy <#generation> ;
            dcat:distribution <#turtle> .

        <#anton-wiklund>
            a foaf:Agent ;
            foaf:name "Anton Wiklund" ;
            foaf:mbox <mailto:anton@example.org> .

        <#generation>
            a prov:Activity ;
            prov:wasInformedBy <#review-0> ;
            prov:used <#taxonomy-version-1> ,
                      <#taxonomy-version-2> ,
                      <#taxonomy-version-3> .

        {{review}}
        """
    lines = [textwrap.dedent(header).format(title=TITLE, description=DESCRIPTION, keywords=KEYWORDS,
                                            review=REVIEW).rstrip("\n")]
    for v in (1, 2, 3):
        lines += [
            "",
            f"<#taxonomy-version-{v}>",
            "    a prov:Entity ;",
            f'    dcat:version "{v}" ;',
            f'    dcterms:issued "{VERSIONS[v]}"^^xsd:dateTime ;',
            f"    rdfs:seeAlso <{td.snapshot_url(v)}> ;",
            "    spdx:checksum [ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; "
            f'spdx:checksumValue "{checksums[v]}"^^xsd:hexBinary ] .',
        ]
    lines += td.card_lines(cards, {}, VERSIONS)
    lines += ["", "<#turtle>", "    a dcat:Distribution ;", "    dcat:downloadURL <> ."]
    return "\n".join(lines) + "\n"


class Deck(unittest.TestCase):
    """A test with a deck and a taxonomy of its own, which the script reads in place of the real
    ones."""

    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        self.deck = self.root / td.DECK
        self.deck.mkdir()
        self.v1 = self.deck / "v1.ttl"
        self.v1.write_text(first_version(), encoding="utf-8")
        self.cache = self.root / "cache"
        self.cache.mkdir()
        for v in TAXONOMY:
            answer = json.dumps(api_answer(v), ensure_ascii=False)
            self.snapshot(v).write_text(answer, encoding="utf-8")
        self.versions = dict(VERSIONS)
        for name, value in (
            ("load_versions", lambda: self.versions),
            ("fetch_json", mock.Mock(side_effect=AssertionError("the tests fetch nothing"))),
        ):
            patch = mock.patch.object(td, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        # git is not asked: the script is taken as not committed, wherever the tests run.
        patch = mock.patch.object(td.subprocess, "run", side_effect=OSError("no git in the tests"))
        patch.start()
        self.addCleanup(patch.stop)

    def snapshot(self, version: int) -> Path:
        return self.cache / f"occupation-name-{version}.json"

    def run_script(self, *args: str) -> tuple[str, str]:
        """Runs main() with these options, returning what it printed and what it reported."""
        out, err = io.StringIO(), io.StringIO()
        argv = ["taxonomy_deck.py", "--deck", str(self.deck), *args]
        with mock.patch.object(sys, "argv", argv), redirect_stdout(out), redirect_stderr(err):
            td.main()
        return out.getvalue(), err.getvalue()

    def make_v2(self) -> str:
        self.notes_file = self.root / "notes.txt"
        self.run_script("--to", "4", "--issued", "2026-11-02", "--allow-uncommitted",
                        "--cache-dir", str(self.cache), "--notes-file", str(self.notes_file))
        return (self.deck / "v2.ttl").read_text(encoding="utf-8")


class FirstVersion(Deck):
    def test_the_fixture_has_the_cards_the_taxonomy_calls_for(self) -> None:
        cards = td.previous_version(self.deck).cards
        fronts = ["Aktiemäklare", "Finansmäklare", "Hamnarbetare", "Maskinskötare", "Motorman"]
        self.assertEqual(sorted(r.front for r in cards.values()), fronts)
        self.assertEqual(cards[td.card_id("Hamnarbetare")].back.text, td.NO_REPLACEMENT)
        self.assertFalse(any(r.retired for r in cards.values()))


class Check(Deck):
    def test_says_there_is_an_update_when_the_taxonomy_has_a_newer_version(self) -> None:
        out, _ = self.run_script("--check")
        self.assertEqual(out.splitlines(), ["newest=4", "released=3", "update=true", "next=2"])

    def test_says_there_is_none_when_the_deck_covers_the_newest_version(self) -> None:
        del self.versions[4]
        out, _ = self.run_script("--check")
        self.assertEqual(out.splitlines(), ["newest=3", "released=3", "update=false", "next=2"])


class Verify(Deck):
    def test_passes_when_the_cards_come_out_the_same(self) -> None:
        _, err = self.run_script("--verify", "--cache-dir", str(self.cache))
        self.assertIn("v1.ttl: its 5 cards come out byte for byte the same from taxonomy versions "
                      "1 to 3", err)

    def test_fails_when_a_card_says_something_else(self) -> None:
        text = self.v1.read_text(encoding="utf-8")
        altered = text.replace('solid-memo:back "Ingen ersättare"@sv',
                               'solid-memo:back "Stuvare"@sv')
        self.assertNotEqual(altered, text)
        self.v1.write_text(altered, encoding="utf-8")
        with self.assertRaises(SystemExit) as stop:
            self.run_script("--verify", "--cache-dir", str(self.cache))
        message = str(stop.exception.code)
        self.assertIn(f"{self.v1}: its cards do not come out the same", message)
        self.assertIn('-    solid-memo:back "Stuvare"@sv', message)
        self.assertIn('+    solid-memo:back "Ingen ersättare"@sv', message)


class NextVersion(Deck):
    def setUp(self) -> None:
        super().setUp()
        self.text = self.make_v2()
        self.v2 = td.previous_version(self.deck)

    def block(self, subject: str) -> str:
        """A subject's block, as written, from its first line to the empty line after it."""
        start = self.text.index(f"\n{subject}\n") + 1
        end = self.text.find("\n\n", start)
        return self.text[start:end if end >= 0 else len(self.text)]

    def test_is_the_next_version_of_the_deck(self) -> None:
        self.assertEqual(self.v2.path, self.deck / "v2.ttl")
        self.assertTrue(self.text.startswith(f"@base <{BASE}/v2.ttl> .\n"))
        self.assertIn('    dcat:version "2" ;\n', self.text)
        self.assertIn(f"    dcat:prev <{BASE}/v1.ttl> ;\n", self.text)
        self.assertIn(f"    dcat:previousVersion <{BASE}/v1.ttl> ;\n", self.text)
        self.assertIn('    dcterms:issued "2026-11-02T00:00:00Z"^^xsd:dateTime ;\n', self.text)
        modified = '    dcterms:modified "2024-09-02T10:15:30.000Z"^^xsd:dateTime ;\n'
        self.assertIn(modified, self.text)
        self.assertEqual(self.v2.taxonomy_versions, [1, 2, 3, 4])

    def test_names_the_issues_as_its_contact_point(self) -> None:
        self.assertIn("    dcat:contactPoint <#contact> ;\n", self.text)
        self.assertEqual(self.block("<#contact>"), "<#contact>\n    a vcard:Kind ;\n"
                         "    vcard:hasURL <https://github.com/solid-memo/website/issues> .")

    def test_carries_over_the_texts_and_the_creators_name_but_no_email(self) -> None:
        self.assertIn(f"    dcterms:title {TITLE} ;\n", self.text)
        self.assertIn(f"    dcterms:description {DESCRIPTION} ;\n", self.text)
        self.assertIn(f"    dcat:keyword {KEYWORDS} ;\n", self.text)
        self.assertIn("    dcterms:creator <#anton-wiklund> ;\n", self.text)
        self.assertEqual(self.block("<#anton-wiklund>"),
                         '<#anton-wiklund>\n    a foaf:Agent ;\n    foaf:name "Anton Wiklund" .')
        self.assertNotIn("foaf:mbox", self.text)
        self.assertNotIn("mailto:", self.text)

    def test_carries_over_the_review_and_links_it_from_the_generation(self) -> None:
        self.assertIn(f"\n{REVIEW}\n", self.text)
        self.assertIn("    prov:wasInformedBy <#review-0> ;\n", self.block("<#generation>"))

    def test_records_the_command_with_to_and_issued(self) -> None:
        generation = self.block("<#generation>")
        comment = next(line for line in generation.splitlines() if "rdfs:comment" in line)
        self.assertIn(f"--deck {self.deck} --to 4 --issued 2026-11-02", comment)
        for left_out in ("--cache-dir", "--notes-file", "--allow-uncommitted", "--verbose"):
            self.assertNotIn(left_out, comment)
        self.assertIn(f"<{td.REPO_URL}/blob/main/", generation)

    def test_writes_the_notes_to_the_file_and_the_deck(self) -> None:
        notes = self.notes_file.read_text(encoding="utf-8").removesuffix("\n")
        self.assertIn(f"    adms:versionNotes {td.ttl_str(notes)} ;\n", self.text)
        self.assertTrue(notes.startswith(
            "Adds taxonomy version 4 (2024-09-02) to the deck's version 1, which covered taxonomy "
            "versions 1 to 3: 1 new name, 0 changed names and 1 card retired, no longer made by the "
            "rules (Hamnarbetare);"), notes)
        self.assertTrue(notes.endswith("; and 1 retired card."), notes)

    def test_retires_the_card_of_a_name_back_in_use(self) -> None:
        retired = self.v2.cards[td.card_id("Hamnarbetare")]
        self.assertTrue(retired.retired)
        self.assertEqual(retired.back.text, td.NO_REPLACEMENT)  # as v1 had it
        self.assertIn("    owl:deprecated true ;\n", self.block(f"<#{td.card_id('Hamnarbetare')}>"))
        self.assertEqual([r.front for r in self.v2.cards.values() if r.retired], ["Hamnarbetare"])

    def test_adds_the_new_name_and_keeps_the_others(self) -> None:
        cards = self.v2.cards
        new = cards[td.card_id("Dataskyddsombud")]
        self.assertEqual((new.back.text, new.created, new.retired),
                         (td.NEW_OCCUPATION, "2024-09-02T10:15:30.000Z", False))
        self.assertEqual(len(cards), 6)  # v1's five, and the new one
        replaced = cards[td.card_id("Aktiemäklare")]
        self.assertEqual((replaced.back.label["en"], replaced.back.text, replaced.retired),
                         ("Replaced by", "Finansmäklare", False))
        renamed = cards[td.card_id("Motorman")]
        self.assertEqual((renamed.back.label["en"], renamed.back.text),
                         ("Renamed to", "Maskinskötare"))
        self.assertNotIn(td.card_id("Kock"), cards)

    def test_cards_come_out_the_same_again(self) -> None:
        _, err = self.run_script("--verify", "--cache-dir", str(self.cache))
        self.assertIn("v2.ttl: its 6 cards come out byte for byte the same from taxonomy versions "
                      "1 to 4", err)

    def test_names_the_concepts_each_card_is_about(self) -> None:
        about = {r.front: r.subjects for r in self.v2.cards.values()}
        self.assertEqual(about, {
            "Aktiemäklare": [f"{td.CONCEPT}aktie"],
            "Dataskyddsombud": [f"{td.CONCEPT}data"],
            "Finansmäklare": [f"{td.CONCEPT}finans"],
            "Hamnarbetare": [f"{td.CONCEPT}hamn"],  # retired, as v1 had it
            "Maskinskötare": [f"{td.CONCEPT}motor"],
            "Motorman": [f"{td.CONCEPT}motor"],
        })
        self.assertIn(f"    dcterms:subject <{td.CONCEPT}aktie> ;\n",
                      self.block(f"<#{td.card_id('Aktiemäklare')}>"))

    def test_names_what_replaces_a_concept_on_the_concept_and_keeps_the_names_on_the_back(self) -> None:
        self.assertEqual(self.block(f"<{td.CONCEPT}aktie>"),
                         f"<{td.CONCEPT}aktie>\n    dcterms:isReplacedBy <{td.CONCEPT}finans> .")
        self.assertEqual(self.text.count("dcterms:isReplacedBy"), 1)
        self.assertEqual(self.v2.cards[td.card_id("Aktiemäklare")].back.text, "Finansmäklare")
        self.assertLess(self.text.index(f"\n<{td.CONCEPT}aktie>\n"), self.text.index(td.DISTRIBUTION))


class SameVersions(Deck):
    """A version made from the taxonomy versions the previous one covers, by a script that writes
    more of them: here v1 as a script that named no concepts made it."""

    def setUp(self) -> None:
        super().setUp()
        text = self.v1.read_text(encoding="utf-8")
        start = text.index("\n<#", text.index("<#taxonomy-version-3>"))
        cards, end = text[start:text.index(td.DISTRIBUTION)], text.index(td.DISTRIBUTION)
        cards = "".join(line for line in cards.splitlines(keepends=True) if "dcterms:subject" not in line)
        cards = cards[:cards.index(f"\n\n<{td.CONCEPT}")] + "\n"
        self.v1.write_text(text[:start] + cards + text[end:], encoding="utf-8")
        self.assertNotIn(td.CONCEPT, self.v1.read_text(encoding="utf-8"))
        self.notes_file = self.root / "notes.txt"
        self.run_script("--to", "3", "--issued", "2026-11-02", "--allow-uncommitted",
                        "--cache-dir", str(self.cache), "--notes-file", str(self.notes_file))
        self.v2 = td.previous_version(self.deck)

    def test_names_the_concepts_and_keeps_every_card(self) -> None:
        self.assertEqual(self.v2.taxonomy_versions, [1, 2, 3])
        self.assertEqual(sorted(self.v2.cards), sorted(td.previous_version(self.deck).cards))
        self.assertTrue(all(r.subjects and not r.retired for r in self.v2.cards.values()))

    def test_says_so_in_its_notes(self) -> None:
        notes = self.notes_file.read_text(encoding="utf-8")
        self.assertTrue(notes.startswith(
            "Makes the deck's version 1, which covered taxonomy versions 1 to 3, again from the same "
            "versions: 0 new names and 0 changed names; 0 backs updated; 5 cards naming other taxonomy "
            "concepts than before as what they are about (dcterms:subject). The whole deck now has 5 cards "
            "in use:"), notes)

    def test_cards_come_out_the_same_again(self) -> None:
        _, err = self.run_script("--verify", "--cache-dir", str(self.cache))
        self.assertIn("v2.ttl: its 5 cards come out byte for byte the same from taxonomy versions "
                      "1 to 3", err)


class Refusals(Deck):
    def test_refuses_a_version_whose_cards_come_out_the_same(self) -> None:
        with self.assertRaises(SystemExit) as stop:
            self.run_script("--to", "3", "--allow-uncommitted", "--cache-dir", str(self.cache))
        self.assertEqual(stop.exception.code, "v1.ttl already covers taxonomy version 3, and its cards "
                         "would come out the same: there is nothing to add")
        self.assertFalse((self.deck / "v2.ttl").exists())

    def test_refuses_a_version_older_than_the_deck_covers(self) -> None:
        with self.assertRaises(SystemExit) as stop:
            self.run_script("--to", "2", "--allow-uncommitted", "--cache-dir", str(self.cache))
        self.assertEqual(stop.exception.code,
                         "v1.ttl already covers taxonomy version 3: there is nothing to add")
        self.assertFalse((self.deck / "v2.ttl").exists())

    def test_refuses_a_version_the_taxonomy_does_not_have(self) -> None:
        with self.assertRaises(SystemExit) as stop:
            self.run_script("--to", "5", "--allow-uncommitted", "--cache-dir", str(self.cache))
        self.assertEqual(stop.exception.code, 2)  # argparse's error

    def test_stops_when_a_taxonomy_version_has_changed_since(self) -> None:
        answer = api_answer(2)
        answer["data"]["concepts"][2]["preferred_label"] = "Kock, storhushåll"
        self.snapshot(2).write_text(json.dumps(answer, ensure_ascii=False), encoding="utf-8")
        with self.assertRaises(SystemExit) as stop:
            self.run_script("--to", "4", "--allow-uncommitted", "--cache-dir", str(self.cache))
        message = str(stop.exception.code)
        self.assertIn(f"{self.v1} was made from taxonomy versions whose content has changed since: "
                      "version 2 (", message)
        self.assertNotIn("version 1 (", message)
        self.assertFalse((self.deck / "v2.ttl").exists())

    def test_the_checksum_ignores_order_and_formatting(self) -> None:
        concepts = api_answer(3)["data"]["concepts"]
        self.assertEqual(td.checksum(list(reversed(concepts))), td.checksum(concepts))

    def test_refuses_without_allow_uncommitted_when_the_script_is_not_committed(self) -> None:
        with self.assertRaises(SystemExit) as stop:
            self.run_script("--to", "4", "--issued", "2026-11-02", "--cache-dir", str(self.cache))
        self.assertIn("is not committed and unmodified at HEAD", str(stop.exception.code))
        self.assertFalse((self.deck / "v2.ttl").exists())


class PreviousVersion(unittest.TestCase):
    def test_picks_the_highest_number_not_the_last_name(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            deck = Path(folder)
            for name in ("v9.ttl", "v10.ttl", "v2.ttl", "v01.ttl", "draft.ttl"):
                (deck / name).write_text(f"# {name}\n", encoding="utf-8")
            previous = td.previous_version(deck)
            self.assertEqual((previous.number, previous.path.name, previous.text),
                             (10, "v10.ttl", "# v10.ttl\n"))

    def test_finds_none_in_an_empty_folder(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            self.assertIsNone(td.previous_version(Path(folder)))


class FetchJson(unittest.TestCase):
    URL = "https://taxonomy.example/versions"

    def answer(self, data: object) -> io.BytesIO:
        return io.BytesIO(json.dumps(data).encode())

    def error(self, code: int) -> urllib.error.HTTPError:
        headers: dict = {}
        error = urllib.error.HTTPError(self.URL, code, "an error", headers, io.BytesIO())  # type: ignore
        self.addCleanup(error.close)
        return error

    def test_tries_again_after_a_server_error(self) -> None:
        urlopen = mock.Mock(side_effect=[self.error(503), self.answer({"ok": True})])
        with mock.patch("urllib.request.urlopen", urlopen), mock.patch("time.sleep") as sleep, \
                redirect_stderr(io.StringIO()) as err:
            self.assertEqual(td.fetch_json(self.URL), {"ok": True})
        self.assertEqual(urlopen.call_count, 2)
        sleep.assert_called_once_with(td.RETRY_AFTER[0])
        self.assertIn("HTTP 503; trying again in", err.getvalue())
        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("User-agent"), td.USER_AGENT)

    def test_tries_again_when_the_server_cannot_be_reached(self) -> None:
        urlopen = mock.Mock(side_effect=[urllib.error.URLError("timed out"), self.answer([1])])
        with mock.patch("urllib.request.urlopen", urlopen), mock.patch("time.sleep") as sleep, \
                redirect_stderr(io.StringIO()):
            self.assertEqual(td.fetch_json(self.URL), [1])
        sleep.assert_called_once_with(td.RETRY_AFTER[0])

    def test_gives_up_after_the_last_try(self) -> None:
        urlopen = mock.Mock(side_effect=[self.error(503)] * (len(td.RETRY_AFTER) + 1))
        with mock.patch("urllib.request.urlopen", urlopen), mock.patch("time.sleep") as sleep, \
                redirect_stderr(io.StringIO()):
            with self.assertRaises(urllib.error.HTTPError):
                td.fetch_json(self.URL)
        self.assertEqual(urlopen.call_count, len(td.RETRY_AFTER) + 1)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], list(td.RETRY_AFTER))

    def test_does_not_try_again_after_a_client_error(self) -> None:
        urlopen = mock.Mock(side_effect=[self.error(404)])
        with mock.patch("urllib.request.urlopen", urlopen), mock.patch("time.sleep") as sleep:
            with self.assertRaises(urllib.error.HTTPError) as raised:
                td.fetch_json(self.URL)
        self.assertEqual(raised.exception.code, 404)
        self.assertEqual(urlopen.call_count, 1)
        sleep.assert_not_called()


class Strings(unittest.TestCase):
    """Strings are escaped as the repository's formatter writes them, JSON's escapes, so
    `npm run format:turtle` leaves the cards as the script wrote them and the next --verify
    still finds them the same; and read back to the same text."""

    def test_escapes_as_json_does(self):
        for text in ["Kock, storhushåll", 'a "b" \\ c', "tab\there", "cr\rx", "ctl\x01"]:
            with self.subTest(text=text):
                self.assertEqual(td.ttl_str(text), json.dumps(text, ensure_ascii=False))

    def test_writes_a_line_feed_as_a_space(self):
        self.assertEqual(td.ttl_str("a\nb"), '"a b"')

    def test_reads_back_what_it_wrote(self):
        for text in ["Kock, storhushåll", 'a "b" \\ c', "tab\there", "cr\rx", "ctl\x01"]:
            with self.subTest(text=text):
                self.assertEqual(td.ttl_unescape(td.ttl_str(text)[1:-1]), text)

    def test_reads_turtle_escapes(self):
        self.assertEqual(td.ttl_unescape("caf\\u00e9 \\U0001F600 \\'"), "café \U0001F600 '")


if __name__ == "__main__":
    unittest.main()
