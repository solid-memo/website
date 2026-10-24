#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

"""Make the next version of a label deck with its cards' text in Korean,
German, Spanish and French as well, from the labels Wikidata has for the
things each card names (docs/deck-library.md#languages-from-wikidata).

A label deck is one whose cards name well-known things: a country and its
capital, an element, a star. Wikidata has a name for each in every language,
written by people and CC0, like the decks. The script reads the deck's
newest version, decks/<deck>/vN.ttl, and the deck's mapping,
scripts/wikidata-labels/<deck>.json, which says what each card is about, and
writes vN+1.ttl beside it. Python 3.10+, standard library only.

USAGE
  python3 scripts/wikidata_labels.py --deck capitals-of-the-world
      [--issued 2026-11-02] [--cache-dir DIR] [--verbose] [--allow-uncommitted]
      [--notes-file FILE]
  python3 scripts/wikidata_labels.py --verify [--deck NAME ...] [--cache-dir DIR]

  The script prints a report of what each card got, and what it did not get
  and why, then the version notes (--notes-file also writes them to a file).
  Then run `npm run format:turtle` and `npm run library`, and commit the new
  version with the index and the mapping. --verify writes nothing: for each
  deck named (by default every deck with a mapping), it makes the cards of the
  newest version this script made again, from the version before it, the
  mapping and the Wikidata revisions it records, and fails unless they come
  out byte for byte the same. When Wikidata cannot be reached, it says so and
  succeeds: the weekly workflow .github/workflows/wikidata.yml runs it, never
  a pull request.

SOURCE
  Wikidata, https://www.wikidata.org/, CC0 1.0 for its structured data, read
  through its Action API (https://www.wikidata.org/w/api.php).

THE MAPPING
  scripts/wikidata-labels/<deck>.json, written once and checked by a person,
  so nothing is guessed again on a later run:

    {
      "description": {"en": "…", "sv": "…", "ko": "…", "de": "…", "es": "…", "fr": "…"},
      "frames": {"highest-point": {"en": "Highest point of {0}", "sv": "Högsta punkten i {0}", …}},
      "labels": {"Capital": {"sv": "Huvudstad", "ko": "수도", …}},
      "untranslated": ["la"],
      "cards": {
        "croatia": {"front": "{Q224}", "back": "{Q1435}"},
        "afghanistan": {"front": "{Q889}", "back": "{Q199471} (AFN)"},
        "albania": {"front": {"frame": "highest-point", "items": ["Q222"]}, "back": "{Q1006}"},
        "coal-tit": {"front": "{Q27075864}", "not": {"es": ["Parus ater"]}},
        "europe": {"skip": "a continent's name is no country's"}
      }
    }

  - "cards" names every card in use, by its fragment id: what its front and
    back are made of, or why it is skipped. A side is a template, the same in
    every language, in which {Q…} is the item's label ("{Q199471} (AFN)":
    "Afghan afghani (AFN)"), or a frame, a template written in each language
    with {0}, {1}, … for the items, in their order. A side the mapping leaves
    out (a Latin name, a year) is left as it is.
  - "frames" are written in all six languages: English and Swedish only to
    check the mapping against the cards (see the report).
  - "labels" translates each card label (solid-memo:frontLabel, backLabel)
    the deck has, by its English text.
  - "description" is the deck's description in the next version, which says
    which languages its cards are in.
  - "untranslated", optional: languages in which a card's text is a name no
    language translates, such as a species' scientific name ("la"). A label
    that is that text is no translation, and the card goes without it.
  - "not", on a card, optional: labels Wikidata has in a language that are
    wrong for the card (a former scientific name, the name of another bird),
    by language. The card goes without that language until Wikidata's label
    is another, which is the place to mend it; the report says so.

METHOD
  - A card gets a language when every side the mapping makes has a label in
    it, for every item the side names; else it goes without, and the report
    says which item lacks it. A card's labels (frontLabel, backLabel) get the
    languages its sides get. Its notes are left as they are.
  - English and Swedish text stays exactly as it is: some Swedish names follow
    the Swedish Language Council rather than Wikidata, and some English names
    are the author's own wording. The Korean, German, Spanish and French text
    of a side the mapping makes is the script's: it writes it afresh on every
    run, so a mistake in it is mended on Wikidata, or in the mapping.
  - A label is an item's label in the language. For German, Spanish and
    French, an item with none there has its "mul" label, the name Wikidata
    gives as the same in many languages, mostly a person's or a place's in
    the Latin script; never for Korean, which is written in Hangul.
  - Each card names the items it is about (dcterms:subject, the items of its
    front and then its back), so a later version can be checked against
    Wikidata item by item (docs/deck-library.md#what-a-card-is-about).
  - The report compares the card's English and Swedish text with what the
    mapping makes from Wikidata's labels in those languages. A difference is
    often meant (see above), but it is how a wrong item is found.

REPRODUCIBILITY
  A version is a pure function of the version before it, the mapping, the
  revision of each item read, this script and the command line, and records
  them, so its cards can be made again byte for byte:
  - the script: prov:wasAssociatedWith the script at the commit that last
    changed it, with its SHA-256 and the Python and Unicode versions it ran
    with. The script refuses
    to run unless it is committed and unmodified at HEAD (--allow-uncommitted
    writes a draft pointing at main);
  - the mapping, by its path and SHA-256 (it is committed with the version);
  - the command line, without the options that do not change the output
    (--cache-dir, --verbose, --allow-uncommitted, --notes-file);
  - every item read, by the revision whose labels were read:
    https://www.wikidata.org/wiki/Special:EntityData/Q224.json?revision=N.
  Nothing depends on when the run is: the deck's dcterms:issued is the date
  --issued gives, and items and cards are written in a fixed order.

POLITE TO WIKIDATA
  Standard library only, an honest User-Agent with a contact URL, one request
  at a time, 50 items a request, gzip, and waiting as long as Wikidata asks
  when it answers 429 or 5xx (https://www.mediawiki.org/wiki/API:Etiquette,
  https://foundation.wikimedia.org/wiki/Policy:User-Agent_policy). The
  requests only read, so they send no maxlag: on Wikidata it counts the
  query service's lag, which edits cause, to hold back bots that edit, and
  it can refuse every request for hours while that service catches up. With
  --cache-dir, the labels of each revision read are kept: a revision never
  changes. --verify reads the items' current revisions first, and the content
  of an older revision only for an item edited since.
"""

from __future__ import annotations

import argparse
import difflib
import gzip
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import textwrap
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "SolidMemoDeckGenerator/1.0 (https://github.com/solid-memo/website)"
ENTITY = "http://www.wikidata.org/entity/"  # an item's IRI is this and its QID
REVISION = "https://www.wikidata.org/wiki/Special:EntityData/{}.json?revision={}"
WIKIDATA = "https://www.wikidata.org/"  # the source's IRI, as the library's decks name it

# The languages the script adds, the app's but English and Swedish, in the
# order the decks write their titles; and those it only reads, for the report.
LANGUAGES = ("ko", "de", "es", "fr")
CHECKED = ("en", "sv")
READ = (*CHECKED, *LANGUAGES, "mul")
# The languages an item's "mul" label stands in for, when it has none of its own.
MUL = {"en", "sv", "de", "es", "fr"}
NAMES = {"ko": "Korean", "de": "German", "es": "Spanish", "fr": "French"}
LANGUAGE_IRI = "http://publications.europa.eu/resource/authority/language/"
CODES = {"ko": "KOR", "de": "DEU", "es": "SPA", "fr": "FRA"}

BATCH = 50  # items a request, as many as the API takes
REVISION_BATCH = 10  # old revisions a request: each is the item's whole content
RETRY_AFTER = (5, 15, 45, 90)  # seconds, unless Wikidata says how long

ROOT = Path(__file__).resolve().parent.parent
DECKS = ROOT / "decks"
MAPPINGS = ROOT / "scripts" / "wikidata-labels"
SITE = "https://solid-memo.com/decks"
REPO_URL = "https://github.com/solid-memo/website"
CONTACT = "https://github.com/solid-memo/website/issues"
CC0 = "<https://creativecommons.org/publicdomain/zero/1.0/>"


class Unreachable(Exception):
    """Wikidata did not answer, or not with what was asked."""


# --------------------------------------------------------------------------- Wikidata


def fetch_json(params: dict[str, str]) -> dict:
    """One request to the Action API, retried while Wikidata is busy or down."""
    query = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    req = urllib.request.Request(f"{API}?{query}", headers={
        "User-Agent": USER_AGENT, "Accept": "application/json", "Accept-Encoding": "gzip"})
    problem = ""
    for wait in (*RETRY_AFTER, None):
        asked = None  # seconds, as Wikidata's Retry-After says
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = resp.read()
                if resp.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                data = json.loads(body)
            error = data.get("error") if isinstance(data, dict) else None
            if error is None:
                return data
            raise Unreachable(f"Wikidata answered {error.get('code')}: {error.get('info')}")
        except urllib.error.HTTPError as error:
            if error.code != 429 and error.code < 500:
                raise Unreachable(f"HTTP {error.code} from {API}") from error
            problem = f"HTTP {error.code}"
            asked = error.headers.get("Retry-After") if error.headers else None
        except (urllib.error.URLError, OSError, ValueError) as error:
            problem = str(getattr(error, "reason", error))
        if wait is None:
            break
        wait = max(wait, int(asked)) if asked and asked.isdigit() else wait
        print(f"{problem}; trying again in {wait} s", file=sys.stderr)
        time.sleep(wait)
    raise Unreachable(f"{problem}, after {len(RETRY_AFTER) + 1} tries")


Labels = dict[str, str]  # language -> label


def labels_of(entity: dict) -> Labels:
    """The labels the script reads, of an item as the API gives it, in NFC."""
    labels = entity.get("labels") or {}
    return {lang: unicodedata.normalize("NFC", labels[lang]["value"].strip())
            for lang in READ if isinstance(labels, dict) and lang in labels}


def cached(cache_dir: Path | None, qid: str, revision: int) -> Path | None:
    return cache_dir / f"{qid}-{revision}.json" if cache_dir else None


def keep(cache_dir: Path | None, qid: str, revision: int, labels: Labels) -> None:
    path = cached(cache_dir, qid, revision)
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(labels, ensure_ascii=False, sort_keys=True), encoding="utf-8")


def current(qids: list[str], cache_dir: Path | None) -> dict[str, tuple[int, Labels]]:
    """Each item's current revision and its labels, 50 items a request."""
    found: dict[str, tuple[int, Labels]] = {}
    problems: list[str] = []
    for i in range(0, len(qids), BATCH):
        batch = qids[i:i + BATCH]
        print(f"fetching the labels of {len(batch)} items from Wikidata", file=sys.stderr)
        data = fetch_json({"action": "wbgetentities", "ids": "|".join(batch), "props": "labels|info",
                           "languages": "|".join(READ), "redirects": "no"})
        entities = data.get("entities")
        if not isinstance(entities, dict):
            raise Unreachable(f"unexpected answer: {json.dumps(data)[:300]}")
        for qid in batch:
            entity = entities.get(qid) or {}
            if "missing" in entity or "lastrevid" not in entity:
                problems.append(f"  {qid}: no such item")
            elif "redirects" in entity or entity.get("id") != qid:
                problems.append(f"  {qid}: now a redirect to {entity.get('redirects', {}).get('to', entity.get('id'))}")
            else:
                found[qid] = (entity["lastrevid"], labels_of(entity))
                keep(cache_dir, qid, *found[qid])
    if problems:
        sys.exit("the mapping names items Wikidata no longer has as such; update it:\n" + "\n".join(problems))
    return found


def at_revisions(revisions: dict[str, int], cache_dir: Path | None) -> dict[str, Labels]:
    """The labels each item had at the revision given: kept ones first, then
    the current revision where it is the same, then the old revisions' content."""
    labels: dict[str, Labels] = {}
    for qid, revision in revisions.items():
        path = cached(cache_dir, qid, revision)
        if path and path.exists():
            labels[qid] = json.loads(path.read_text(encoding="utf-8"))
    rest = sorted((q for q in revisions if q not in labels), key=qid_order)
    if not rest:
        return labels
    now = current(rest, cache_dir) if rest else {}
    older = sorted((q for q in rest if now[q][0] != revisions[q]), key=qid_order)
    labels.update({q: now[q][1] for q in rest if q not in older})
    for i in range(0, len(older), REVISION_BATCH):
        batch = older[i:i + REVISION_BATCH]
        print(f"fetching {len(batch)} older revisions from Wikidata", file=sys.stderr)
        data = fetch_json({"action": "query", "prop": "revisions", "rvprop": "ids|content", "rvslots": "main",
                           "revids": "|".join(str(revisions[q]) for q in batch)})
        pages = (data.get("query") or {}).get("pages") or []
        content = {}
        for page in pages:
            for rev in page.get("revisions") or []:
                text = ((rev.get("slots") or {}).get("main") or {}).get("content")
                if text is not None:
                    content[rev["revid"]] = json.loads(text)
        for qid in batch:
            entity = content.get(revisions[qid])
            if entity is None or entity.get("id") != qid:
                raise Unreachable(f"revision {revisions[qid]} of {qid} could not be read")
            labels[qid] = labels_of(entity)
            keep(cache_dir, qid, revisions[qid], labels[qid])
    return labels


def qid_order(qid: str) -> int:
    return int(qid[1:])


# --------------------------------------------------------------------------- the mapping

SLOT = re.compile(r"\{(Q[1-9][0-9]*)\}")
FRAME_SLOT = re.compile(r"\{([0-9]+)\}")


@dataclass
class Mapping:
    path: Path
    sha256: str
    description: dict[str, str]
    frames: dict[str, dict[str, str]]
    labels: dict[str, dict[str, str]]
    untranslated: list[str]
    cards: dict[str, dict]

    def items(self, side: str | dict) -> list[str]:
        """The items a side names, in their order."""
        return list(side["items"]) if isinstance(side, dict) else SLOT.findall(side)

    def render(self, side: str | dict, lang: str, labels: dict[str, Labels],
               refused: dict[str, list[str]] | None = None) -> str | None:
        """A side's text in a language, or None when an item has no label in
        it, or only one the card refuses."""
        def label(qid: str) -> str | None:
            own = labels[qid].get(lang)
            found = own if own is not None else labels[qid].get("mul") if lang in MUL else None
            return None if found in (refused or {}).get(lang, []) else found
        names = [label(q) for q in self.items(side)]
        if any(n is None for n in names):
            return None
        if isinstance(side, dict):
            return FRAME_SLOT.sub(lambda m: names[int(m.group(1))], self.frames[side["frame"]][lang])
        return SLOT.sub(lambda m: label(m.group(1)), side)  # type: ignore[arg-type,return-value]


def load_mapping(deck: str) -> Mapping:
    path = MAPPINGS / f"{deck}.json"
    if not path.exists():
        sys.exit(f"{path} does not exist: the deck has no mapping yet")
    raw = path.read_bytes()
    data = json.loads(raw)
    problems: list[str] = []
    every = (*CHECKED, *LANGUAGES)
    for lang in every:
        if not (data.get("description") or {}).get(lang):
            problems.append(f"the description has no {lang!r}")
    for name, frame in (data.get("frames") or {}).items():
        problems += [f"frame {name!r} has no {lang!r}" for lang in every if lang not in frame]
    for text, label in (data.get("labels") or {}).items():
        problems += [f"label {text!r} has no {lang!r}" for lang in ("sv", *LANGUAGES) if lang not in label]
    for card, sides in (data.get("cards") or {}).items():
        if "skip" in sides:
            continue
        if not set(sides) & {"front", "back"} or set(sides) - {"front", "back", "not"}:
            problems.append(f"card {card!r}: give its front, its back or both, or why it is skipped")
        refused = sides.get("not", {})
        if not isinstance(refused, dict) or any(
                lang not in LANGUAGES or not isinstance(texts, list) or not all(isinstance(x, str) for x in texts)
                for lang, texts in refused.items()):
            problems.append(f"card {card!r}: its \"not\" gives no list of labels by language ({', '.join(LANGUAGES)})")
        for name, side in ((n, s) for n, s in sides.items() if n in ("front", "back")):
            if isinstance(side, dict):
                if side.get("frame") not in (data.get("frames") or {}):
                    problems.append(f"card {card!r}: its {name} names no frame of the mapping")
                elif not all(isinstance(q, str) and re.fullmatch(r"Q[1-9][0-9]*", q) for q in side.get("items", [])):
                    problems.append(f"card {card!r}: its {name}'s items are not QIDs")
            elif not isinstance(side, str) or not SLOT.search(side):
                problems.append(f"card {card!r}: its {name} names no item ({{Q…}})")
    if problems:
        sys.exit(f"{path}:\n" + "\n".join(f"  {p}" for p in problems))
    return Mapping(path, hashlib.sha256(raw).hexdigest(), data["description"], data.get("frames") or {},
                   data.get("labels") or {}, data.get("untranslated") or [], data["cards"])


# --------------------------------------------------------------------------- Turtle

LITERAL = re.compile(r'^"((?:[^"\\]|\\.)*)"(?:@([a-zA-Z0-9-]+))?$')
TTL_ESCAPES = {"t": "\t", "b": "\b", "n": "\n", "r": "\r", "f": "\f"}


def ttl_str(s: str) -> str:
    """A short Turtle string, escaped as the repository's formatter writes one."""
    return json.dumps(s, ensure_ascii=False)


def ttl_unescape(s: str) -> str:
    return re.sub(r"\\(?:u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|(.))",
                  lambda m: chr(int(m.group(1) or m.group(2), 16)) if m.group(3) is None
                  else TTL_ESCAPES.get(m.group(3), m.group(3)), s)


def literal(obj: str) -> tuple[str, str | None] | None:
    """A literal's text and language tag, or None for anything else."""
    m = LITERAL.match(obj)
    return (ttl_unescape(m.group(1)), m.group(2)) if m else None


@dataclass
class Block:
    """A subject as the formatter writes it: its comments, the subject, and one
    entry per predicate, each with its objects as written, in order."""
    subject: str
    entries: list[list] = field(default_factory=list)  # [predicate, [objects]]
    comments: list[str] = field(default_factory=list)

    def get(self, predicate: str) -> list[str]:
        return next((objs for p, objs in self.entries if p == predicate), [])

    def set(self, predicate: str, objects: list[str], *, after: str | None = None, before: str | None = None) -> None:
        """Replace a predicate's objects where it is, or add it after or before
        another predicate, or at the end."""
        for entry in self.entries:
            if entry[0] == predicate:
                entry[1] = objects
                return
        preds = [p for p, _ in self.entries]
        at = (preds.index(after) + 1 if after in preds else preds.index(before) if before in preds
              else len(self.entries))
        self.entries.insert(at, [predicate, objects])

    def remove(self, predicate: str) -> None:
        self.entries = [e for e in self.entries if e[0] != predicate]

    def text(self) -> str:
        lines = [*self.comments, self.subject]
        for i, (predicate, objects) in enumerate(self.entries):
            end = " ." if i == len(self.entries) - 1 else " ;"
            lines.append(f"    {predicate} " + (" ,\n" + " " * (5 + len(predicate))).join(objects) + end)
        return "\n".join(lines)


@dataclass
class Document:
    base: str
    prefixes: list[tuple[str, str]]
    blocks: list[Block]

    def block(self, subject: str) -> Block | None:
        return next((b for b in self.blocks if b.subject == subject), None)

    def text(self) -> str:
        width = max((len(name) + 1 for name, _ in self.prefixes), default=0)
        head = [f"@base <{self.base}> .", ""]
        if self.prefixes:
            head += [f"@prefix {(name + ':').ljust(width)} <{iri}> ." for name, iri in self.prefixes] + [""]
        return "\n".join([*head, ""]) + "\n\n".join(b.text() for b in self.blocks) + "\n"


def parse(text: str, where: str) -> Document:
    """A version as the formatter writes it: no long strings, one object a line."""
    if '"""' in text:
        sys.exit(f"{where}: has a long string (\"\"\"), which this script does not read")
    base = re.search(r"^@base <([^>]*)> \.$", text, re.M)
    prefixes = re.findall(r"^@prefix ([^:\s]*): +<([^>]*)> \.$", text, re.M)
    body = re.sub(r"\A(?:(?:@base|@prefix) [^\n]*\n|\n)*", "", text)
    blocks: list[Block] = []
    for chunk in body.strip("\n").split("\n\n"):
        lines = chunk.split("\n")
        comments = [line for line in lines if line.startswith("#")]
        rest = lines[len(comments):]
        block = Block(rest[0], comments=comments)
        for line in rest[1:]:
            first = re.fullmatch(r"    (\S+) (.*) [,;.]", line)
            more = re.fullmatch(r" {6,}(.*) [,;.]", line)
            if first:
                block.entries.append([first.group(1), [first.group(2)]])
            elif more and block.entries:
                block.entries[-1][1].append(more.group(1))
            else:
                sys.exit(f"{where}: cannot read the line {line!r} of {rest[0]}")
        blocks.append(block)
    if base is None:
        sys.exit(f"{where}: has no @base")
    return Document(base.group(1), prefixes, blocks)


def is_card(block: Block) -> bool:
    return "solid-memo:Card" in block.get("a")


def card_id(block: Block) -> str:
    return block.subject.removeprefix("<#").removesuffix(">")


# --------------------------------------------------------------------------- cards

SIDES = {"front": "solid-memo:front", "back": "solid-memo:back"}
CARD_LABELS = {"front": "solid-memo:frontLabel", "back": "solid-memo:backLabel"}


@dataclass
class Outcome:
    """What a run made of the cards, for the report and the version notes."""
    cards: int = 0  # in use
    languages: dict[str, int] = field(default_factory=lambda: {lang: 0 for lang in LANGUAGES})
    without: dict[str, list[str]] = field(default_factory=lambda: {lang: [] for lang in LANGUAGES})
    differs: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)


def texts(block: Block, predicate: str) -> dict[str, str]:
    """A predicate's literals, by language tag."""
    return {tag or "": text for text, tag in filter(None, map(literal, block.get(predicate)))}


def make_cards(document: Document, mapping: Mapping, labels: dict[str, Labels]) -> tuple[list[Block], Outcome]:
    """The cards of the next version: those in use that the mapping makes, with
    their sides in the languages the labels have; the rest as they were."""
    outcome = Outcome()
    cards = [b for b in document.blocks if is_card(b)]
    in_use = {card_id(b) for b in cards if "true" not in b.get("owl:deprecated")}
    problems = [f"  card {c!r} is not in use in the deck" for c in mapping.cards if c not in in_use]
    problems += [f"  card {c!r} is not in the mapping" for c in sorted(in_use) if c not in mapping.cards]
    for block in cards:
        for name, predicate in CARD_LABELS.items():
            en = texts(block, predicate).get("en")
            if en is not None and card_id(block) in in_use and en not in mapping.labels:
                problems.append(f"  card {card_id(block)!r}: its {name} label {en!r} is not in the mapping's labels")
    if problems:
        sys.exit(f"{mapping.path} does not fit the deck:\n" + "\n".join(sorted(set(problems))))

    made: list[Block] = []
    for block in cards:
        cid = card_id(block)
        if cid not in in_use:
            made.append(block)
            continue
        outcome.cards += 1
        sides = mapping.cards[cid]
        if "skip" in sides:
            outcome.skipped.append(f"{cid}: {sides['skip']}")
            made.append(block)
            continue
        refused: dict[str, list[str]] = sides.get("not", {})
        sides = {name: side for name, side in sides.items() if name in SIDES}
        new = Block(block.subject, [[p, list(o)] for p, o in block.entries], list(block.comments))
        own = {name: texts(block, SIDES[name]) for name in sides}
        for name, side in sides.items():
            for lang in CHECKED:
                rendered = mapping.render(side, lang, labels)
                if rendered is not None and lang in own[name] and rendered != own[name][lang]:
                    outcome.differs.append(f"{cid}, {name}, {lang}: {own[name][lang]!r} on the card, "
                                           f"{rendered!r} from Wikidata")
        untranslated = {t for text in (texts(block, p) for p in SIDES.values())
                        for tag, t in text.items() if tag in mapping.untranslated}
        got: list[str] = []
        for lang in LANGUAGES:
            rendered = {name: mapping.render(side, lang, labels, refused) for name, side in sides.items()}
            items = list(dict.fromkeys(q for side in sides.values() for q in mapping.items(side)))
            named = lambda q: f"{q} ({labels[q]['en']})" if "en" in labels[q] else q  # noqa: E731
            lacking = [named(q) for q in items if mapping.render(f"{{{q}}}", lang, labels) is None]
            denied = [f"{mapping.render(f'{{{q}}}', lang, labels)!r} of {named(q)}" for q in items
                      if q not in lacking and mapping.render(f"{{{q}}}", lang, labels, refused) is None]
            same = [t for t in rendered.values() if t in untranslated]
            if lacking or denied or same:
                why = (f"no {NAMES[lang]} label for {', '.join(lacking)}" if lacking
                       else f"the mapping refuses the {NAMES[lang]} label {', '.join(denied)}" if denied
                       else f"the {NAMES[lang]} label is the untranslated name {same[0]!r}")
                outcome.without[lang].append(f"{cid}: {why}")
                continue
            got.append(lang)
            outcome.languages[lang] += 1
        for name, side in sides.items():
            kept = [o for o in block.get(SIDES[name]) if (literal(o) or ("", None))[1] not in LANGUAGES]
            rendered = {lang: mapping.render(side, lang, labels, refused) for lang in got}
            new.set(SIDES[name], kept + [f"{ttl_str(rendered[lang])}@{lang}" for lang in got])  # type: ignore[arg-type]
        for predicate in CARD_LABELS.values():
            objects = block.get(predicate)
            en = texts(block, predicate).get("en")
            if en is not None:
                kept = [o for o in objects if (literal(o) or ("", None))[1] not in LANGUAGES]
                new.set(predicate, kept + [f"{ttl_str(mapping.labels[en][lang])}@{lang}" for lang in got])
        items = dict.fromkeys(q for side in sides.values() for q in mapping.items(side))
        anchor = "dcterms:created" if block.get("dcterms:created") else "solid-memo:formatVersion"
        new.set("dcterms:subject", [f"<{ENTITY}{q}>" for q in items], after=anchor)
        made.append(new)
    return made, outcome


# --------------------------------------------------------------------------- provenance


@dataclass
class Provenance:
    script_url: str  # pinned to a commit, unless --allow-uncommitted
    script_sha256: str
    commit: str | None  # None: the script is not committed and unmodified
    command: str
    python: str


def script_provenance(allow_uncommitted: bool, options: list[str]) -> Provenance:
    """This run, for the version's PROV block. The script must be committed and
    unmodified at HEAD, so the version can name the exact code that made it:
    the commit that last changed it, which later commits, such as the next
    deck's version, leave as it is; --allow-uncommitted writes a draft
    pointing at `main` instead."""
    script = Path(__file__).resolve()

    def git(*args: str) -> str | None:
        try:
            return subprocess.run(["git", *args], cwd=script.parent, capture_output=True,
                                  text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return None

    top = git("rev-parse", "--show-toplevel")
    rel = os.path.relpath(script, top).replace(os.sep, "/") if top else script.name
    sha = git("log", "-1", "--format=%H", "--", str(script)) if top else None
    tracked = top and git("ls-files", "--error-unmatch", str(script)) is not None
    clean = tracked and git("status", "--porcelain", "--", str(script)) == ""
    commit = sha if sha and clean else None
    if commit is None:
        if not allow_uncommitted:
            sys.exit(f"{rel} is not committed and unmodified at HEAD, so the deck could not name the "
                     "code that made it. Commit it first, or pass --allow-uncommitted for a draft.")
        print(f"warning: {rel} is not committed and unmodified at HEAD; this is a draft, and its "
              "provenance points at 'main' instead of a commit", file=sys.stderr)
    return Provenance(
        script_url=f"{REPO_URL}/blob/{commit or 'main'}/{rel}",
        script_sha256=hashlib.sha256(script.read_bytes()).hexdigest(),
        commit=commit,
        command=shlex.join(["python3", rel, *options]),
        python=f"Python {sys.version.split()[0]}, Unicode {unicodedata.unidata_version}",
    )


REVISION_IRI = re.compile(r"<https://www\.wikidata\.org/wiki/Special:EntityData/(Q[0-9]+)\.json\?revision=([0-9]+)>")
ACTIVITY = "<#wikidata-labels>"
MAPPING = "<#wikidata-mapping>"


def recorded(document: Document) -> tuple[dict[str, int], str | None]:
    """The item revisions a version made by this script read, and its mapping's SHA-256."""
    activity = document.block(ACTIVITY)
    mapping = document.block(MAPPING)
    revisions = {q: int(r) for o in (activity.get("prov:used") if activity else [])
                 for q, r in REVISION_IRI.findall(o)}
    sha = re.search(r'spdx:checksumValue "([0-9a-f]+)"', " ".join(mapping.get("spdx:checksum"))) if mapping else None
    return revisions, sha.group(1) if sha else None


# --------------------------------------------------------------------------- the next version


def language_list(langs: list[str]) -> str:
    names = [NAMES[lang] for lang in langs]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def version_notes(outcome: Outcome, *, contact_added: bool) -> str:
    gained = [lang for lang in LANGUAGES if outcome.languages[lang]]
    counts = ", ".join(f"{outcome.languages[lang]} in {NAMES[lang]}" for lang in gained)
    notes = (f"Card text in {language_list(gained)} as well, from Wikidata's labels of what each card names: "
             f"of the {outcome.cards} cards in use, {counts}; English and Swedish text unchanged. "
             if gained else f"No card text in {language_list(list(LANGUAGES))}: Wikidata has no labels for them. ")
    notes += "Each card names the Wikidata items it is about (dcterms:subject)."
    if outcome.skipped:
        notes += f" {outcome.cards - len(outcome.skipped)} cards are made from Wikidata; {len(outcome.skipped)} are not, as the mapping says why."
    if contact_added:
        notes += " The deck names the project's issue tracker as its contact, and no email."
    return notes


def comment(lines: list[str], width: int = 96) -> list[str]:
    out: list[str] = []
    for line in lines:
        indent = "    " if line.startswith("  ") else ""
        out += ["#" if not line else "# " + w for w in (textwrap.wrap(
            line, width, subsequent_indent=indent, break_on_hyphens=False, break_long_words=False) or [""])]
    return out


def next_version(document: Document, cards: list[Block], outcome: Outcome, mapping: Mapping, *, deck: str,
                 number: int, revisions: dict[str, int], issued: str, provenance: Provenance) -> tuple[str, str]:
    """Version `number` of the deck, and its notes: the previous version with
    its cards made again, its release fields for the new version, the
    languages its cards gained, and how it was made."""
    here, previous_iri = f"{SITE}/{deck}/v{number}.ttl", f"{SITE}/{deck}/v{number - 1}.ttl"
    deck_block = document.block("<>")
    if deck_block is None:
        sys.exit(f"{deck}: the version has no <> subject")
    contact_added = not deck_block.get("dcat:contactPoint")
    notes = version_notes(outcome, contact_added=contact_added)
    gained = [lang for lang in LANGUAGES if outcome.languages[lang]]

    replaced = {ACTIVITY, MAPPING}
    blocks = [b for b in document.blocks if b.subject not in replaced
              and not ("prov:SoftwareAgent" in b.get("a") and '"wikidata_labels.py"' in b.get("dcterms:title"))]
    for block in blocks:
        block.remove("foaf:mbox")
    made = {c.subject: c for c in cards}
    blocks = [made.get(b.subject, b) for b in blocks]

    d = deck_block
    d.set("dcterms:description", [f"{ttl_str(mapping.description[lang])}@{lang}" for lang in (*CHECKED, *LANGUAGES)])
    sources = d.get("prov:wasDerivedFrom")
    if f"<{WIKIDATA}>" not in sources:
        d.set("prov:wasDerivedFrom", [*sources, f"<{WIKIDATA}>"], after="dcterms:description")
    generated = d.get("prov:wasGeneratedBy")
    if ACTIVITY not in generated:
        d.set("prov:wasGeneratedBy", [*generated, ACTIVITY], after="prov:wasDerivedFrom")
    if d.get("dcterms:modified"):
        d.set("dcterms:modified", [f'"{issued}T00:00:00Z"^^xsd:dateTime'])
    languages = d.get("dcterms:language")
    d.set("dcterms:language", [*languages, *(f"<{LANGUAGE_IRI}{CODES[lang]}>" for lang in gained
                                            if f"<{LANGUAGE_IRI}{CODES[lang]}>" not in languages)])
    d.set("solid-memo:formatVersion", ["6"])  # deck format 6, which a new version is written at
    d.set("dcat:version", [f'"{number}"'])
    d.set("dcat:prev", [f"<{previous_iri}>"], after="dcat:version")
    d.set("dcat:previousVersion", [f"<{previous_iri}>"], after="dcat:prev")
    d.set("dcterms:issued", [f'"{issued}T00:00:00Z"^^xsd:dateTime'], after="dcat:previousVersion")
    d.set("adms:versionNotes", [ttl_str(notes)], after="dcterms:issued")
    if contact_added:
        d.set("dcat:contactPoint", ["<#contact>"], before="dcat:distribution")

    first_card = next(i for i, b in enumerate(blocks) if is_card(b))
    added: list[Block] = []
    if blocks[0] is not d:
        sys.exit(f"{deck}: <> is not the version's first subject")
    if contact_added and not any(b.subject == "<#contact>" for b in blocks):
        agents = [i for i, b in enumerate(blocks[:first_card]) if "foaf:Agent" in b.get("a")]
        blocks.insert((agents[-1] if agents else 0) + 1,
                      Block("<#contact>", [["a", ["vcard:Kind"]], ["vcard:hasURL", [f"<{CONTACT}>"]]]))
        first_card += 1
    if not any(b.subject == f"<{WIKIDATA}>" for b in blocks):
        added.append(Block(f"<{WIKIDATA}>", [
            ["dcterms:title", ['"Wikidata"']],
            ["dcterms:creator", ['"Wikidata contributors"']],
            ["dcterms:license", [CC0]],
            ["rdfs:comment", [ttl_str("https://www.wikidata.org/wiki/Wikidata:Licensing — \"All structured data "
                                      "(i.e. the main, Property, Lexeme, and EntitySchema namespaces) is released "
                                      "into the public domain under Creative Commons Zero.\"") + "@en"]],
        ]))
    if not any(b.subject == CC0 for b in blocks):
        added.append(Block(CC0, [["a", ["dcterms:LicenseDocument"]]]))
    reproduce = (f"git checkout {provenance.commit} && {provenance.command}" if provenance.commit
                 else f"{provenance.command} (a draft: the script was not committed)")
    rel_mapping = mapping.path.relative_to(ROOT).as_posix() if mapping.path.is_relative_to(ROOT) else mapping.path.name
    added += [
        Block(ACTIVITY, [
            ["a", ["prov:Activity"]],
            ["prov:used", [f"<{previous_iri}>", MAPPING,
                           *(f"<{REVISION.format(q, revisions[q])}>" for q in sorted(revisions, key=qid_order))]],
            ["prov:wasAssociatedWith", [f"<{provenance.script_url}>"]],
            ["rdfs:comment", [ttl_str(f"{provenance.command} ({provenance.python})")]],
        ], comment([
            "How this version's Korean, German, Spanish and French card text was made (W3C PROV-O): from "
            "the previous version, the mapping that says what each card is about, and the labels of each "
            "Wikidata item at the revision named here, by the script named here. English and Swedish text, "
            "and the notes, are the previous version's. To make it again, with the mapping as it was "
            "committed with this version, or to check that its cards come out byte for byte the same from "
            "the same revisions, from the repository root:",
            f"  {reproduce}",
            f"  python3 scripts/wikidata_labels.py --verify --deck {deck}",
        ])),
        Block(MAPPING, [
            ["a", ["prov:Entity"]],
            ["dcterms:title", [ttl_str(rel_mapping)]],
            ["spdx:checksum", ["[ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; "
                               f'spdx:checksumValue "{mapping.sha256}"^^xsd:hexBinary ]']],
        ]),
        Block(f"<{provenance.script_url}>", [
            ["a", ["prov:SoftwareAgent"]],
            ["dcterms:title", ['"wikidata_labels.py"']],
            ["spdx:checksum", ["[ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; "
                               f'spdx:checksumValue "{provenance.script_sha256}"^^xsd:hexBinary ]']],
        ]),
    ]
    if not any(b.subject == "spdx:checksumAlgorithm_sha256" for b in blocks):
        added.append(Block("spdx:checksumAlgorithm_sha256", [["a", ["spdx:ChecksumAlgorithm"]]]))
    blocks[first_card:first_card] = added

    prefixes = list(document.prefixes)
    needed = {"dcterms": "http://purl.org/dc/terms/", "prov": "http://www.w3.org/ns/prov#",
              "rdfs": "http://www.w3.org/2000/01/rdf-schema#", "xsd": "http://www.w3.org/2001/XMLSchema#",
              "dcat": "http://www.w3.org/ns/dcat#", "adms": "http://www.w3.org/ns/adms#",
              "vcard": "http://www.w3.org/2006/vcard/ns#", "spdx": "http://spdx.org/rdf/terms#"}
    names = {name for name, _ in prefixes}
    prefixes += [(name, iri) for name, iri in needed.items() if name not in names]
    return Document(here, prefixes, blocks).text(), notes


# --------------------------------------------------------------------------- the report


def report(deck: str, previous: int, outcome: Outcome, *, verbose: bool) -> str:
    lines = [f"{deck} v{previous} -> v{previous + 1}: {outcome.cards} cards in use, "
             f"{outcome.cards - len(outcome.skipped)} made from Wikidata, {len(outcome.skipped)} skipped",
             "Cards in each language: " + ", ".join(f"{NAMES[lang]} {outcome.languages[lang]}" for lang in LANGUAGES)]

    def section(title: str, entries: list[str]) -> None:
        if not entries:
            return
        lines.extend(["", f"{title} ({len(entries)})"])
        shown = entries if verbose else entries[:10]
        lines.extend(f"  {e}" for e in shown)
        if len(entries) > len(shown):
            lines.append(f"  … and {len(entries) - len(shown)} more (--verbose lists them all)")

    for lang in LANGUAGES:
        section(f"WITHOUT {NAMES[lang].upper()}", outcome.without[lang])
    section("SKIPPED, as the mapping says", outcome.skipped)
    section("ENGLISH OR SWEDISH TEXT THAT DIFFERS FROM WIKIDATA'S LABELS (often meant; a wrong item shows here)",
            outcome.differs)
    return "\n".join(lines)


# --------------------------------------------------------------------------- main


@dataclass
class Version:
    number: int
    path: Path
    document: Document


def versions_of(deck: str) -> list[Version]:
    folder = DECKS / deck
    numbered = sorted((int(m.group(1)), f) for f in folder.glob("v*.ttl")
                      if (m := re.fullmatch(r"v([1-9][0-9]*)\.ttl", f.name)))
    return [Version(n, f, parse(f.read_text(encoding="utf-8"), str(f))) for n, f in numbered]


def card_section(blocks: list[Block]) -> str:
    return "\n\n".join(b.text() for b in blocks if is_card(b))


def verify(deck: str, cache_dir: Path | None) -> bool:
    """Whether the newest version this script made of the deck comes out the
    same; None-like False when it differs (the reason printed)."""
    versions = versions_of(deck)
    made = next((v for v in reversed(versions) if v.document.block(ACTIVITY)), None)
    if made is None:
        print(f"{deck}: no version was made by this script yet; nothing to verify", file=sys.stderr)
        return True
    revisions, sha = recorded(made.document)
    mapping = load_mapping(deck)
    if sha != mapping.sha256:
        print(f"{made.path}: was made with another mapping than {mapping.path} (SHA-256 {sha}, now "
              f"{mapping.sha256}); make the deck's next version with this one", file=sys.stderr)
        return False
    before = next(v for v in versions if v.number == made.number - 1)
    labels = at_revisions(revisions, cache_dir)
    cards, _ = make_cards(before.document, mapping, labels)
    again, published = card_section(cards), card_section(made.document.blocks)
    if again != published:
        diff = difflib.unified_diff(published.splitlines(), again.splitlines(), made.path.name, "made again",
                                    lineterm="", n=1)
        print(f"{made.path}: its cards do not come out the same (Python {sys.version.split()[0]}, Unicode "
              f"{unicodedata.unidata_version}):\n" + "\n".join(list(diff)[:60]), file=sys.stderr)
        return False
    print(f"{made.path.name} of {deck}: its {sum(1 for b in cards if is_card(b))} cards come out byte for byte "
          f"the same from {len(revisions)} Wikidata revisions", file=sys.stderr)
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--deck", action="append", default=[],
                    help="the deck, by its folder's name in decks/ (with --verify, several; default: every deck "
                         "with a mapping)")
    ap.add_argument("--issued", default=None,
                    help="the date the version is published, YYYY-MM-DD (default: today, in UTC)")
    ap.add_argument("--cache-dir", type=Path, default=None,
                    help="keep the labels of each revision read here, and reuse them")
    ap.add_argument("--verbose", action="store_true", help="list every card in the report, not just ten of each")
    ap.add_argument("--allow-uncommitted", action="store_true",
                    help="write a draft although this script is not committed and unmodified")
    ap.add_argument("--notes-file", type=Path, default=None, help="also write the version notes to this file")
    ap.add_argument("--verify", action="store_true",
                    help="write nothing: make the cards of the newest version this script made again, from the "
                         "revisions it records, and fail unless they come out byte for byte the same")
    args = ap.parse_args()

    if args.verify:
        decks = args.deck or sorted(p.stem for p in MAPPINGS.glob("*.json"))
        failed = []
        for deck in decks:
            try:
                if not verify(deck, args.cache_dir):
                    failed.append(deck)
            except Unreachable as error:
                print(f"warning: {deck} not verified: Wikidata could not be reached ({error})", file=sys.stderr)
                if os.environ.get("GITHUB_ACTIONS") == "true":
                    print(f"::warning::{deck} not verified: Wikidata could not be reached ({error})")
        if failed:
            sys.exit(f"not the same: {', '.join(failed)}")
        return

    if len(args.deck) != 1:
        ap.error("name the deck to make the next version of: --deck NAME")
    deck = args.deck[0]
    issued = args.issued if args.issued is not None else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", issued):
        ap.error(f"--issued {issued}: give a date, YYYY-MM-DD")
    versions = versions_of(deck)
    if not versions:
        ap.error(f"{DECKS / deck} has no version to start from")
    previous = versions[-1]
    mapping = load_mapping(deck)
    provenance = script_provenance(args.allow_uncommitted, ["--deck", deck, "--issued", issued])
    qids = sorted({q for sides in mapping.cards.values() if "skip" not in sides
                   for name, side in sides.items() if name in SIDES for q in mapping.items(side)}, key=qid_order)
    try:
        found = current(qids, args.cache_dir)
    except Unreachable as error:
        sys.exit(f"Wikidata could not be reached: {error}")
    labels = {q: found[q][1] for q in qids}
    cards, outcome = make_cards(previous.document, mapping, labels)
    print(report(deck, previous.number, outcome, verbose=args.verbose), file=sys.stderr)
    number = previous.number + 1
    text, notes = next_version(previous.document, cards, outcome, mapping, deck=deck, number=number,
                               revisions={q: found[q][0] for q in qids}, issued=issued, provenance=provenance)
    output = previous.path.parent / f"v{number}.ttl"
    output.write_text(text, encoding="utf-8")
    if args.notes_file is not None:
        args.notes_file.write_text(notes + "\n", encoding="utf-8")
    print(f"\nwrote {output}\n\nVERSION NOTES\n" + textwrap.fill(notes, 100, initial_indent="  ",
                                                                  subsequent_indent="  ")
          + "\n\nThen: npm run format:turtle && npm run library (docs/deck-library.md#languages-from-wikidata)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
