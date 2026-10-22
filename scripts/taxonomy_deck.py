#!/usr/bin/env python3

# SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
#
# SPDX-License-Identifier: MIT

"""Make the next version of the "Swedish labour market taxonomy: new and changed
occupation names" deck from the labor market taxonomy of Arbetsförmedlingen,
the Swedish Public Employment Service: a Swedish occupation name as it was ->
what it is called today, and what changed; and a name that is new -> when it
came, and what it replaces (docs/deck-library.md#the-taxonomy-deck).

The deck is decks/swedish-labour-market-taxonomy-occupation-names/. Its newest
version, vN.ttl, is the previous version: the script writes vN+1.ttl next to
it, covering every taxonomy version up to --to (default: the newest). Python
3.10+, standard library only. One snapshot of the taxonomy's occupation names
is fetched per version (~0.7 MB each); with --cache-dir they are kept, since a
published version never changes.

USAGE
  python3 scripts/taxonomy_deck.py [--to 32] [--issued 2026-11-02] [--cache-dir DIR]
      [--verbose] [--allow-uncommitted] [--notes-file FILE]
  python3 scripts/taxonomy_deck.py --check
  python3 scripts/taxonomy_deck.py --verify [--cache-dir DIR]

  The script prints a report of what it included, excluded and adjusted and
  why, then the version notes (--notes-file also writes them to a file). Then
  run `npm run format:turtle` and `npm run library`, and commit the new version
  with the library's index. --check writes nothing and says whether the
  taxonomy has a version the deck's newest version lacks; --verify writes
  nothing and makes the cards of the deck's newest version again, from the
  taxonomy versions it records, failing unless they come out byte for byte
  the same. The weekly workflow .github/workflows/taxonomy.yml runs both.

SOURCE
  Arbetsmarknadstaxonomi, Arbetsförmedlingen (served by its JobTech API)
  https://taxonomy.api.jobtechdev.se/v1/taxonomy/   CC0 1.0 (as stated in
  Arbetsförmedlingen's DCAT record on dataportal.se), so the deck is CC0 too.

METHOD
  The static dumps on data.arbetsformedlingen.se list live concepts only, so
  the deck is built from the taxonomy's GraphQL API, which returns every
  occupation-name concept of a version, deprecated ones included, with the
  live concepts each deprecated one is replaced by:

    concepts(type: "occupation-name", version: N, include_deprecated: true)
      { id preferred_label deprecated replaced_by { id preferred_label } }

  Every card has a name on the front, with a note under it (card format 3),
  shown once the answer is revealed: the verdict, "In use" or "Out of use".
  Its back has a label that says how the answer relates to the name, the
  answer itself, what the name stands for today, and a note under it that
  says when. Two rules decide the cards. An outdated name is a name a
  concept had while it was live and no longer has, because the concept was
  renamed or deprecated. Its answer is what the concept is called today
  (itself if live, its successors if deprecated, " · " between them):

    Aktiemäklare (Out of use) -> "Replaced by" / "Finansmäklare" / "In taxonomy version 30, …"
    Motorman (Out of use) -> "Replaced by" / "Motorman fartyg" / "In taxonomy version 27, …"
    Arbetsledare, mureri (Out of use) -> "Renamed to" / "Arbetsledare, murning" / "In taxonomy version N, …"
    Asfaltarbetare (Out of use) -> "Replaced by" / "Asfaltverksmaskinist · Beläggningsarbetare" /
        "Renamed to Asfaltarbetare, asfaltframställning in taxonomy version 17; replaced in version 22, …"
    Scentekniker (In use) -> "Synonym added" / "Teatertekniker/Scentekniker" / "Teatertekniker added in …"
    Hamnarbetare/Stuveriarbetare (Out of use) -> "Synonym removed" / "Hamnarbetare" / "Stuveriarbetare removed in …"
    X (Out of use) -> "Ingen ersättare" / "Went out of use in taxonomy version N, …"

  A new name is a name a live concept has today that no live concept had in
  the first version read (give or take punctuation, spacing or word order).
  Its answer is what it replaces, if anything:

    Finansmäklare (In use) -> "Replacing" / "Aktiemäklare · …" / "Added in taxonomy version 30, …"
    X (In use) -> "Nytt yrke" / "Added in taxonomy version N, …"

  The answer is always Swedish, like the names: "Nytt yrke" (a new
  occupation), "Ingen ersättare" (no replacement).

  Each card names the concepts it is about by their IRIs, as the taxonomy
  gives them (http://data.jobtechdev.se/taxonomy/concept/<id>): an outdated
  name the concepts that had it, a new name the live concepts that have it,
  as dcterms:subject. A replaced concept's successors, the ones its back
  names, follow the cards as dcterms:isReplacedBy of the concept, not of the
  card: the back keeps their names, which a learner reads, and the IRIs let
  a later version be checked against the taxonomy card by card
  (docs/deck-library.md#what-a-card-is-about). A retired card keeps the
  subjects it was published with. The notes and the label
  are in English and Swedish, and the app shows the reader's language.

  One card per name: a new name that later goes out of use keeps its card,
  whose back then tells what replaced it, and an outdated name that comes back
  into use becomes a new name again.

  Not cards: an old name that is today's name give or take punctuation,
  spacing or word order ("7-9" -> "7–9", "A/B" -> "B/A"), or exactly (a new
  concept with the same name, or a name the concept has again); and an old name
  a live concept has. Concepts that had the same outdated name share one card.

  The deck is cumulative, and meant to grow by one version per taxonomy
  version (or by one that covers the same versions as the previous one, when
  the script has changed what it writes of them): a later run adds cards and changes backs, so an imported copy keeps
  its reviews when it is upgraded. A card of the previous version that no
  rule makes any longer (say, a name back in use as it was in the first
  version) is never removed but retired (owl:deprecated true), as it was last
  published: a copy keeps it and its reviews, but no longer studies it, and a
  later version can bring it back. Card ids come from the front alone
  ("<slug>-<hash>"), since the outdated name never changes; the replaced_by
  links are always read from the newest version, as the taxonomy repoints them
  rather than chaining (see below). Every card's dcterms:created is the time of
  the version its name went out of use in, so a re-run that finds nothing new
  changes no card.

  The names left out, and every inconsistency below, are printed as a report
  of what the run included, excluded and adjusted, and why, with examples
  (--verbose: every name), and written into the deck as a comment before
  <#generation>; the description sums up the exclusions.

INCONSISTENCIES IN THE TAXONOMY
  - The static dumps (all-concepts.json) list live concepts only, without
    replaced-by links: hence the GraphQL API.
  - Renamed back: version 16 put back some 200 earlier names, and version 17
    undid it. Old names are compared with today's name, not version by version.
  - Relabeled at deprecation: a deprecated concept often gets an older name
    back ("Hamnarbetare" deprecated as "Hamnarbetare/Stuveriarbetare"). Such a
    label was never in use, so it is never a card.
  - Replaced by the same name: the taxonomy often deprecates a concept and
    makes a new one with the very same name. No card.
  - Repointing: when a replacement is itself replaced, the taxonomy changes the
    older concepts' replaced_by rather than chaining, so a back can change.
  - Replacements missing: some concepts had none when deprecated and got one
    later; one version dropped the replacements of a few, and the next put
    new ones back. The back names the last replacement given, or none.
  - Revived: a few concepts were deprecated and later made live again.
  - Names reused: a deprecated name that a live concept has (e.g.
    "Skatterådgivare") is left out.

REPRODUCIBILITY
  A version is a pure function of the taxonomy versions read, this script, the
  command line and the previous version, and records the first three (the
  commit holds the fourth), so it can be reproduced byte for byte, today or
  years from now:
  - the script: prov:wasGeneratedBy an activity associated with the script at
    a pinned commit, with the script's SHA-256 and the Python and Unicode
    versions it ran with (slugs and case folding depend on them). The script
    refuses to run unless it is committed and unmodified at HEAD
    (--allow-uncommitted writes a draft pointing at main);
  - the command line, with --to and --issued always written out, without
    options that do not change the output (--cache-dir, --verbose,
    --allow-uncommitted, --notes-file);
  - every taxonomy version read: its number, publication time, the GraphQL
    query that fetched it, and a SHA-256 of the answer normalized as
    checksum() describes. A run checks the versions against the previous
    version's checksums and stops if one has changed.
  Nothing depends on the time or place of the run: the deck's
  dcterms:modified is the newest taxonomy version's publication time, its
  dcterms:issued the date --issued gives, each card's dcterms:created the time
  of the taxonomy version it records, and the concepts are processed in id
  order.

  The description says what the deck is, not what a version did: that goes in
  the version notes (adms:versionNotes), which the script writes by comparing
  with the previous version: how many names are new, how many changed (and
  how), and which cards were retired or brought back.

LANGUAGE
  Solid Memo is English first. The script writes the deck's metadata the
  library asks of a new version (docs/deck-library.md#publishing-a-new-version)
  and carries over from the previous version what it cannot make itself: the
  title, description and keywords in every language of the app, the creator's
  name, and the review activities that made those texts. The deck stays at deck
  format 5, which tags each keyword with its language. The notes and labels on
  the cards are in English and Swedish; the occupation names, front and back,
  are Swedish and tagged so. The cards stay at card format 4, which states a
  text's language (card format 3 brought the notes and retired cards).
"""

from __future__ import annotations

import argparse
import collections
import difflib
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

API = "https://taxonomy.api.jobtechdev.se/v1/taxonomy"
TAXONOMY = f"{API}/#Taxonomi"  # the dataset's IRI in Arbetsförmedlingen's DCAT catalog
USER_AGENT = "SolidMemoDeckGenerator/1.0 (https://github.com/solid-memo/website)"
CONCEPT = "http://data.jobtechdev.se/taxonomy/concept/"  # a concept's IRI is this and its id, as the API's `uri` gives it
CONCEPT_TYPE = "occupation-name"
QUERY = (
    '{ concepts(type: "%s", version: "%d", include_deprecated: true) '
    "{ id preferred_label deprecated replaced_by { id preferred_label } } }"
)


# --------------------------------------------------------------------------- taxonomy


@dataclass
class Concept:
    id: str
    label: str
    deprecated: bool
    replaced_by: list[str]


RETRY_AFTER = (10, 30, 90)  # seconds; the API answers 503 now and then, a moment before it answers


def fetch_json(url: str) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for wait in RETRY_AFTER:
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as error:
            if error.code < 500:
                raise
            print(f"HTTP {error.code}; trying again in {wait} s", file=sys.stderr)
        except urllib.error.URLError as error:
            print(f"{error.reason}; trying again in {wait} s", file=sys.stderr)
        time.sleep(wait)
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.load(resp)


def load_versions() -> dict[int, str]:
    """Taxonomy version -> the time it was published, as an xsd:dateTime."""
    url = f"{API}/main/versions"
    print(f"fetching {url}", file=sys.stderr)
    return {
        v["taxonomy/version"]: v["taxonomy/timestamp"]
        for v in fetch_json(url)  # type: ignore[union-attr]
    }


def snapshot_url(version: int) -> str:
    return f"{API}/graphql?" + urllib.parse.urlencode({"query": QUERY % (CONCEPT_TYPE, version)})


def load_snapshot(version: int, cache_dir: Path | None) -> tuple[dict[str, Concept], str]:
    """Every occupation-name concept of a version, deprecated ones included, by
    id in id order; and the SHA-256 of the snapshot normalized (see checksum)."""
    cached = cache_dir / f"{CONCEPT_TYPE}-{version}.json" if cache_dir else None
    if cached and cached.exists():
        data = json.loads(cached.read_text(encoding="utf-8"))
    else:
        print(f"fetching {CONCEPT_TYPE} concepts of taxonomy version {version}", file=sys.stderr)
        data = fetch_json(snapshot_url(version))
        if not isinstance(data, dict) or "data" not in data or data.get("errors"):
            sys.exit(f"taxonomy version {version}: unexpected response: {json.dumps(data)[:500]}")
        if cached:
            cached.parent.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    concepts = sorted(data["data"]["concepts"], key=lambda c: c["id"])
    snapshot = {
        c["id"]: Concept(c["id"], c["preferred_label"].strip(), c["deprecated"],
                         sorted({r["id"] for r in c["replaced_by"] or []}))
        for c in concepts
    }
    return snapshot, checksum(concepts)


def checksum(concepts: list[dict]) -> str:
    """SHA-256 of a snapshot, normalized so that it depends on the data alone and
    not on the order or formatting of the API's response: the concepts sorted by
    id, each concept's replaced_by sorted by id, as JSON with sorted keys, no
    whitespace and UTF-8 text. Recorded in the deck per version, so a later run
    can prove it read the same taxonomy."""
    normal = [{**c, "replaced_by": sorted(c["replaced_by"] or [], key=lambda r: r["id"])}
              for c in sorted(concepts, key=lambda c: c["id"])]
    text = json.dumps(normal, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- cards


def same_name(a: str, b: str) -> bool:
    """Whether two labels differ only in dashes, commas, slashes or spacing
    ("7-9" vs "7–9", "Kock, storhushåll" vs "Kock storhushåll")."""
    norm = lambda s: " ".join(re.sub(r"[,/]", " ", re.sub(r"[‐‑‒–—−]", "-", s)).split()).casefold()
    return norm(a) == norm(b)


def name_parts(label: str) -> set[str]:
    """The names a label joins with "/", normalized: "Verkställande direktör/VD" -> {..., "vd"}."""
    return {re.sub(r"[‐‑‒–—−]", "-", " ".join(p.split())).casefold() for p in label.split("/")}


def name_change(old: str, new: str) -> tuple[str | None, list[str], list[str]]:
    """How name `old` became `new`: (kind, synonyms added, synonyms removed).
    The kind is "punctuation" (dashes, commas, slashes or spacing only, "7-9" ->
    "7–9"), "reordered" (the same "/"-joined names in another order),
    "synonym_added" ("Scentekniker" -> "Teatertekniker/Scentekniker"),
    "synonym_removed" ("Hamnarbetare/Stuveriarbetare" -> "Hamnarbetare"), or
    None for any other change."""
    if same_name(old, new):
        return "punctuation", [], []
    parts = lambda label: {name_parts(p).pop(): p.strip() for p in label.split("/")}
    a, b = parts(old), parts(new)
    if a.keys() == b.keys():
        return "reordered", [], []
    if a.keys() < b.keys():
        return "synonym_added", [b[k] for k in b if k not in a], []
    if b.keys() < a.keys():
        return "synonym_removed", [], [a[k] for k in a if k not in b]
    return None, [], []


def name_key(label: str) -> frozenset[str]:
    """A label's names, as a new name is told from an old one: its "/"-joined
    names, each without its dashes, commas and spacing and case folded, in any
    order ("A/B" and "B/A", "7-9" and "7–9" are the same name)."""
    return frozenset(" ".join(re.sub(r"[‐‑‒–—−]", "-", part).replace(",", " ").split()).casefold()
                     for part in label.split("/"))


def card_id(front: str) -> str:
    """A card's fragment id, from its front alone: a name never changes, so
    neither does the id, whichever concepts the name belonged to, however it
    went out of use, and whether it is new or outdated. The hash tells spellings apart that slug alike
    ("Kock, storhushåll" and "Kock storhushåll")."""
    return f"{slug(front)}-{hashlib.sha1(front.encode()).hexdigest()[:6]}"


def by_name(label: str) -> str:
    return label.casefold()


@dataclass
class Card:
    id: str
    front: str
    replacements: list[str]  # labels
    version: int  # the taxonomy version it records
    kind: str = "replaced"  # a key of CARD_KINDS
    concept_ids: list[str] = field(default_factory=list)  # what it is about: its dcterms:subject
    # A deprecated concept of concept_ids -> the concepts its back names as
    # replacing it, as dcterms:isReplacedBy.
    successors: dict[str, list[str]] = field(default_factory=dict)
    added: list[str] = field(default_factory=list)  # synonyms, for kind "synonym_added"
    removed: list[str] = field(default_factory=list)  # synonyms, for kind "synonym_removed"
    replaces: list[str] = field(default_factory=list)  # outdated names, for kind "new"
    # For a name that went by a rename, of a concept since deprecated: the
    # name it was renamed to, and the version the concept was deprecated in.
    renamed_to: str | None = None
    deprecated_in: int | None = None


# What each kind of card says, as (title, why), for the report.
CARD_KINDS: dict[str, tuple[str, str]] = {
    "new": ("new names",
            "a name a live occupation has today that no live occupation had in the first version read, "
            "give or take punctuation, spacing or word order. Front: the new name; back: in use, and the "
            "outdated names it replaces, or that it is a new occupation; note: the version it came in"),
    "replaced": ("replaced names",
                 "a name that was live and is now deprecated, with the concepts that replace it. "
                 "Front: the old name; back: what replaces it today, and the version it was replaced in"),
    "renamed": ("renamed names",
                "a concept still in use whose earlier name differs from today's by more than "
                "punctuation, word order or synonyms"),
    "synonym_added": ("names that got a new synonym",
                      "the name is still valid, but a synonym was added to it (by a rename or by a new "
                      "concept replacing it), so the learner meets the new term; the back names it"),
    "discontinued": ("names that went out of use with nothing replacing them",
                     "the concept is deprecated and the taxonomy names no successor (yet); the back says "
                     "so, and names the successor if a later version adds one, so the card and its "
                     "reviews stay"),
    "synonym_removed": ("names that lost a synonym",
                        "a synonym in the name went out of use (by a rename or by a new concept "
                        "replacing it); the back names the synonym removed"),
}


@dataclass
class LeftOut:
    """An outdated name that is not a card, and why."""
    label: str
    concept_id: str
    version: int
    reason: str  # a key of LEFT_OUT_BECAUSE


LEFT_OUT_BECAUSE = {
    "live_name": "deprecated, but a live occupation has the same name",
    "live_old_name": "renamed, but a live occupation has the old name",
}

# Why each kind of name is or is not a card, as (section, title, reason). Used
# for the report the script prints and the comment it writes into the deck.
WHY: dict[str, tuple[str, str, str]] = {
    "live_name": ("excluded", "deprecated names a live occupation still has",
                  "another concept that is in use today has exactly this name, so a card calling "
                  "the name outdated would be wrong"),
    "live_old_name": ("excluded", "old names of renamed concepts that a live occupation has",
                      "the old name is in use today by another concept, so it is not outdated"),
    "never_live": ("excluded", "deprecated concepts that were never live in the versions read",
                   "already deprecated in the first version read, or created deprecated: nobody met "
                   "them as a current name, so there is no change to learn"),
    "same_name": ("excluded", "names replaced by a new concept with the same name",
                  "the taxonomy deprecated the concept and made a new one with the very same name: "
                  "the name did not change, so there is nothing to learn"),
    "renamed_back": ("excluded", "old names a concept has again today",
                     "the taxonomy renamed and renamed back (version 16 put back some 200 earlier "
                     "names and version 17 undid it), so old names are compared with the current "
                     "name, not version by version: the old name is the current one"),
    "punctuation": ("excluded", "changes of punctuation or spacing only",
                    "only dashes, commas, slashes or spacing changed (\"7-9\" -> \"7–9\"), whether by a "
                    "rename or by a new concept replacing the old one: nothing to learn"),
    "reordered": ("excluded", "changes of word order only",
                  "the same synonyms in another order (\"A/B\" -> \"B/A\"), whether by a rename or by a "
                  "new concept replacing the old one: nothing to learn"),
    "revived": ("excluded", "names deprecated and later taken back into use",
                "the concept is live again, so the name is not outdated; a card an earlier version had "
                "for it is retired, since it would now be wrong"),
    "relabelled_at_deprecation": ("adjusted", "concepts given another name as they were deprecated",
                                  "the taxonomy often puts back an older name on a concept it deprecates "
                                  "(\"Hamnarbetare\" deprecated as \"Hamnarbetare/Stuveriarbetare\"); "
                                  "such a label was never in use, so the card is for the name the "
                                  "concept last had while live"),
    "renamed_then_replaced": ("adjusted", "old names of concepts that were renamed and later replaced",
                              "the old name keeps its card, which now names what replaces the concept "
                              "today (the note gives both steps), so a learner who studied it keeps its "
                              "reviews"),
    "replacement_missing": ("adjusted", "replaced names whose replacement the taxonomy has dropped",
                            "the newest version names nothing replacing them, though an earlier one "
                            "did: the back names the last replacement given, rather than the card "
                            "disappearing for a version"),
    "handed_over": ("adjusted", "outdated names handed from a deprecated concept to a new one with the same name",
                    "the name lived on, so the card follows it to the concept that had it last: its answer, "
                    "and the version the name really went out of use in"),
    "shared_name": ("adjusted", "outdated names that two concepts had, neither replacing the other",
                    "one card per name, naming the successors of both: two cards with the same front "
                    "would contradict each other"),
    "replacement_added": ("adjusted", "replaced names that had no replacement when deprecated",
                          "the taxonomy added what replaces them in a later version; the back shows "
                          "it, and the note the version the name went out of use in"),
    "repointed": ("adjusted", "replaced names whose replacement was itself replaced later",
                  "the taxonomy repoints the old name to the new successor instead of chaining, and "
                  "the back shows who replaces it today; a later version may change such a back"),
}

# Why the deck is built the way it is, for the report and the deck comment.
METHOD = [
    "The static dumps on data.arbetsformedlingen.se (all-concepts.json) list live concepts only, "
    "without replaced-by links, so the deck is built from the taxonomy's GraphQL API, which returns "
    "deprecated concepts and what replaces them.",
    "The taxonomy keeps replaced_by pointing at live concepts, so the latest version alone says what "
    "every outdated name is called today; the earlier versions are read only to find when each name "
    "went out of use.",
    "Each card has a name on the front. Once the answer is revealed, the note under the front says "
    "whether the name is in use; the label above the back says how the answer relates to the name "
    "(\"Replaced by\", \"Replacing\"); the back is the answer, in Swedish like the names; and the note "
    "under it says what happened, and when. The notes and the label are in English and Swedish.",
    "The first rule: an outdated name is a name a concept had while it was live and no longer has. Its "
    "answer is what the concept is called today (itself if live, its successors if deprecated). Labels "
    "given only at deprecation are never cards.",
    "The second rule: a new name is a name a live concept has today that no live concept had in the "
    "first version read, give or take punctuation, spacing or word order. Its answer is the outdated "
    "names it replaces, or \"Nytt yrke\" (a new occupation). One card per name: a new name that goes out "
    "of use keeps its card, whose back then says what replaced it.",
    "The deck is cumulative: a later version adds cards and changes backs, so a copy imported by a "
    "learner keeps its reviews when it is upgraded. A card of the previous version that neither rule makes "
    "any longer is retired (owl:deprecated true) as it was, never removed: a copy keeps it and its "
    "reviews, but no longer studies it.",
]


Met = dict[str, list[str]]  # a key of WHY -> one line per time it was met, e.g. "Kaplan: Komminister → …"


def build_cards(snaps: dict[int, dict[str, Concept]], since: int,
                to: int) -> tuple[list[Card], list[LeftOut], Met]:
    """The deck's cards, the names left out, and every time one of the
    taxonomy's inconsistencies (see WHY) was met.

    One rule: an outdated name is a name a concept had while it was live, and
    no longer has. Its card names what the concept is called today (itself if
    live, its successors if deprecated), and how and when the name went out of
    use. Labels a concept gets only as it is deprecated (the taxonomy often puts
    back an older name then) are never cards: nobody met them in use."""
    latest = snaps[to]
    live_labels = {c.label for c in latest.values() if not c.deprecated}
    errors: list[str] = []
    left_out: list[LeftOut] = []
    met: Met = collections.defaultdict(list)
    cards: dict[str, Card] = {}  # by front
    candidates: dict[str, list[Card]] = collections.defaultdict(list)  # by front, one per concept

    def live_in(cid: str, v: int) -> bool:
        return cid in snaps[v] and not snaps[v][cid].deprecated

    def labels_in(v: int, ids: list[str]) -> list[str]:
        return sorted({snaps[v][r].label for r in ids if r in snaps[v]}, key=by_name)

    def norm(label: str) -> str:
        return " ".join(re.sub(r"[,/]", " ", re.sub(r"[‐‑‒–—−]", "-", label)).split()).casefold()

    for cid, now in latest.items():
        live_versions = [v for v in range(since - 1, to + 1) if live_in(cid, v)]
        if not live_versions:
            if now.deprecated:
                met["never_live"].append(f"{now.label} ({cid})")
            continue

        # What the concept is called today.
        went = None  # the version it was deprecated in, if it is
        successors: list[str] = []  # the concepts the back names, if it is deprecated
        if not now.deprecated:
            current = [now.label]
            if any(cid in snaps[v] and snaps[v][cid].deprecated for v in range(since, to)):
                back = max(v for v in range(since, to + 1) if live_in(cid, v) and not live_in(cid, v - 1))
                met["revived"].append(f"{now.label} ({cid}): deprecated, and live again since version {back}")
        else:
            went = live_versions[-1] + 1
            last_live = snaps[live_versions[-1]][cid].label
            if now.label != last_live:
                met["relabelled_at_deprecation"].append(
                    f"{last_live} → labelled {now.label} when deprecated in version {went}")
            if now.replaced_by:
                current = []
                for rid in now.replaced_by:
                    if rid in latest and not latest[rid].deprecated:
                        current.append(latest[rid].label)
                        successors.append(rid)
                    else:
                        errors.append(f"  {now.label!r} ({cid}) is replaced by {rid}, "
                                      f"which is not a live concept in version {to}")
                current = sorted(set(current), key=by_name)
            else:  # the taxonomy has dropped its replacement: name the last one it gave
                last = next((v for v in range(to - 1, went - 1, -1) if snaps[v][cid].replaced_by), None)
                current = labels_in(last, snaps[last][cid].replaced_by) if last is not None else []
                successors = [r for r in snaps[last][cid].replaced_by if r in snaps[last]] if last is not None else []
                if current:
                    met["replacement_missing"].append(f"{last_live}: none in version {to}, "
                                                      f"{' · '.join(current)} in version {last}")
            then = snaps[went][cid].replaced_by
            if not current:
                pass  # discontinued: the card says nothing replaces it
            elif not then:
                met["replacement_added"].append(f"{last_live}: deprecated in version {went} with no "
                                                f"replacement → {' · '.join(current)} (version {to})")
            elif now.replaced_by and set(then) != set(now.replaced_by):
                met["repointed"].append(f"{last_live}: {' · '.join(labels_in(went, then))} (version {went}) "
                                        f"→ {' · '.join(current)} (version {to})")

        # Its outdated names, and the version each went out of use in: renamed
        # while live, or deprecated. Names that differ only in punctuation are
        # one name, the most recent spelling kept.
        gone: dict[str, int] = {}
        for v in range(since, to + 1):
            if live_in(cid, v - 1):
                label = snaps[v - 1][cid].label
                if not live_in(cid, v) or snaps[v][cid].label != label:
                    gone[label] = v
        spellings: dict[str, tuple[str, int]] = {}
        for label, v in sorted(gone.items(), key=lambda kv: kv[1]):
            if norm(label) in spellings:
                met["punctuation"].append(f"{spellings[norm(label)][0]} → {label} (version {v}, both "
                                          f"old names of {cid})")
            spellings[norm(label)] = (label, v)

        for label, v in spellings.values():
            by_deprecation = went is not None and v == went
            if not now.deprecated and label == now.label:
                met["renamed_back"].append(f"{label}: gone in version {v}, its name again today")
                continue
            kind, added, removed = name_change(label, current[0]) if len(current) == 1 else (None, [], [])
            if len(current) == 1 and label == current[0]:
                kind = "same_name"
            if kind in ("punctuation", "reordered", "same_name"):
                how = ", as a new concept" if now.deprecated else ""
                met[kind].append(f"{label} → {current[0]} (version {v}{how})")
                continue
            if label in live_labels:
                left_out.append(LeftOut(label, cid, v, "live_name" if by_deprecation else "live_old_name"))
                continue
            # A name renamed away, of a concept deprecated since, is a replaced
            # name: its answer is what replaces the concept today, and its
            # note tells both steps.
            kind = kind or ("discontinued" if not current else "replaced" if now.deprecated else "renamed")
            then = ({"renamed_to": snaps[v][cid].label, "deprecated_in": went}
                    if now.deprecated and not by_deprecation else {})
            candidates[label].append(Card(card_id(label), label, current, v, kind=kind, concept_ids=[cid],
                                          successors={cid: successors} if successors else {},
                                          added=added, removed=removed, **then))

    # A name more than one concept had. Usually a hand-over: the taxonomy
    # deprecated a concept and made a new one with the very same name, which
    # changed nothing about the name, so the card is the new concept's alone.
    # Otherwise one card names the successors of both.
    def handed_over(old: str, new: str) -> bool:
        return any(new in snaps[v][old].replaced_by for v in snaps if old in snaps[v])

    for label, these in candidates.items():
        these = [c for c in these
                 if not any(handed_over(c.concept_ids[0], o.concept_ids[0]) for o in these if o is not c)]
        for c in candidates[label]:
            if c not in these:
                met["handed_over"].append(f"{label}: from {c.concept_ids[0]} to a new concept with the same name")
        card = these[0]
        for other in these[1:]:
            met["shared_name"].append(f"{label}: a name of {card.concept_ids[0]} and of {other.concept_ids[0]}")
            card.replacements = sorted({*card.replacements, *other.replacements}, key=by_name)
            card.kind = next(k for k in ("replaced", "renamed", "discontinued") if k in (card.kind, other.kind)
                             or k == "discontinued")
            if card.kind == "discontinued" and card.replacements:
                card.kind = "replaced"
            card.added, card.removed = [], []
            card.renamed_to, card.deprecated_in = None, None  # two paths: the note gives the first date only
            card.version = min(card.version, other.version)
            card.concept_ids.append(other.concept_ids[0])
            card.successors.update(other.successors)
        cards[label] = card
        if card.renamed_to is not None:  # counted once the card is settled: a hand-over drops a concept's
            met["renamed_then_replaced"].append(f"{label} → {card.renamed_to} (version {card.version}) → "
                                                f"{' · '.join(card.replacements) or 'nothing'} "
                                                f"(version {card.deprecated_in})")

    if errors:
        sys.exit("the taxonomy is not as this script expects:\n" + "\n".join(errors))

    # The new names: live today, and no live concept had them (give or take
    # punctuation, spacing or word order) in the first version read. The
    # version a name came in is the last it appeared in after being absent.
    live_keys = {v: {name_key(c.label) for c in snaps[v].values() if not c.deprecated}
                 for v in range(since - 1, to + 1)}
    for label in sorted(live_labels, key=by_name):
        key = name_key(label)
        if key in live_keys[since - 1] or label in cards:
            continue
        came = max(v for v in range(since, to + 1) if key in live_keys[v] and key not in live_keys[v - 1])
        replaces = sorted({c.front for c in cards.values() if c.kind != "new" and label in c.replacements},
                          key=by_name)
        have = sorted(cid for cid, c in latest.items() if not c.deprecated and c.label == label)
        cards[label] = Card(card_id(label), label, [], came, kind="new", concept_ids=have, replaces=replaces)

    result = sorted(cards.values(), key=lambda c: (by_name(c.front), c.id))
    for what, values in (("front", [c.front for c in result]), ("id", [c.id for c in result])):
        duplicates = sorted({x for x in values if values.count(x) > 1})
        if duplicates:
            sys.exit(f"cards with the same {what}:\n" + "\n".join(f"  {x!r}" for x in duplicates))
    return result, sorted(left_out, key=lambda x: by_name(x.label)), met


# --------------------------------------------------------------------------- provenance

REPO_URL = "https://github.com/solid-memo/website"


@dataclass
class Provenance:
    script_url: str  # pinned to a commit, unless --allow-uncommitted
    script_sha256: str
    commit: str | None  # None: the script is not committed and unmodified
    command: str  # the command line that makes the version again
    python: str


def script_provenance(allow_uncommitted: bool, options: list[str]) -> Provenance:
    """This run, for the deck's PROV block. The script must be committed and
    unmodified at HEAD, so the version can name the exact code that made it;
    --allow-uncommitted writes a draft pointing at `main` instead. `options`
    are the ones that decide the output, written out in full: run from the
    repository root at the commit, they make the version again."""
    script = Path(__file__).resolve()

    def git(*args: str) -> str | None:
        try:
            return subprocess.run(["git", *args], cwd=script.parent, capture_output=True,
                                  text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            return None

    top = git("rev-parse", "--show-toplevel")
    rel = os.path.relpath(script, top).replace(os.sep, "/") if top else script.name
    command = shlex.join(["python3", rel, *options])

    sha = git("rev-parse", "HEAD") if top else None
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
        command=command,
        python=f"Python {sys.version.split()[0]}, Unicode {unicodedata.unidata_version}",
    )


def recorded_checksums(text: str) -> dict[int, str]:
    """Taxonomy version -> snapshot checksum, as a version written by this script records them."""
    return {int(v): h for v, h in re.findall(
        r'^<#taxonomy-version-(\d+)>\n(?:    .*\n)*?    spdx:checksum \[.*?spdx:checksumValue "([0-9a-f]+)"',
        text, re.M)}


# --------------------------------------------------------------------------- Turtle


def ttl_str(s: str) -> str:
    """A short Turtle string, escaped as the repository's formatter writes one (JSON's escapes:
    a quote, a backslash and the control characters), so `npm run format:turtle` leaves it as
    it is; a line feed becomes a space, as a text with one would be written as a long string."""
    return json.dumps(s.replace("\n", " "), ensure_ascii=False)


def slug(s: str) -> str:
    """ASCII, for card ids: "Förskollärare" -> "forskollarare"."""
    ascii_ = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_.lower()).strip("-")


def aligned(predicate: str, objects: list[str]) -> str:
    """An object list in the house style: one object per line, aligned under the first."""
    return (" ,\n" + " " * (5 + len(predicate))).join(objects)


def xsd_datetime(timestamp: str) -> str:
    """The API's timestamps ("2026-08-12T12:30:58.521Z") in the decks' form, whole seconds."""
    when = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(timezone.utc)
    return when.strftime("%Y-%m-%dT%H:%M:%S.000Z")


@dataclass
class Back:
    """What a card says besides its front: the note under the front, the
    verdict ("In use", "Out of use"), shown once the answer is revealed; the
    label above the back, how the answer relates to the front ("Replaced
    by"); the answer; and the note under it, which says when. The notes and
    the label are in English and Swedish (card format 3), empty when a
    card has none; the answer is one text, in Swedish like the names."""
    front_note: dict[str, str]
    label: dict[str, str]
    text: str
    note: dict[str, str]


Text = dict[str, str]  # language tag -> text


def lists(items: list[str]) -> Text:
    """ "A, B and C" in every language."""
    if len(items) == 1:
        return {"en": items[0], "sv": items[0]}
    return {"en": ", ".join(items[:-1]) + " and " + items[-1], "sv": ", ".join(items[:-1]) + " och " + items[-1]}


IN_USE: Text = {"en": "In use", "sv": "Används"}
OUT_OF_USE: Text = {"en": "Out of use", "sv": "Används inte längre"}
NONE: Text = {}
# The answers that are no occupation name, in Swedish like the names.
NEW_OCCUPATION = "Nytt yrke"
NO_REPLACEMENT = "Ingen ersättare"
REPLACED_BY: Text = {"en": "Replaced by", "sv": "Ersatt av"}
RENAMED_TO: Text = {"en": "Renamed to", "sv": "Bytte namn till"}
REPLACING: Text = {"en": "Replacing", "sv": "Ersätter"}
SYNONYM_ADDED: Text = {"en": "Synonym added", "sv": "Synonym tillagd"}
SYNONYM_REMOVED: Text = {"en": "Synonym removed", "sv": "Synonym borttagen"}


def is_new(back: Back) -> bool:
    """Whether a card's back says its front is a new name: what it replaces, or that it is a new occupation."""
    return back.label.get("en") == REPLACING["en"] or back.text == NEW_OCCUPATION


def back_of(card: Card, versions: dict[int, str]) -> Back:
    """The card's back: "Out of use" / "Replaced by" / "Finansmäklare" / "In
    taxonomy version 30, 2026-05-08."; for a new name "In use" / "Replacing" /
    "Aktiemäklare · …", or "In use" / "Nytt yrke"."""
    v, date = card.version, versions[card.version][:10]
    today = " · ".join(card.replacements)
    if card.renamed_to is not None and card.kind in ("replaced", "discontinued"):
        then, then_date = card.deprecated_in, versions[card.deprecated_in][:10]
        replaced = card.kind == "replaced"
        note = {
            "en": f"Renamed to {card.renamed_to} in taxonomy version {v}; "
                  f"{'replaced' if replaced else 'went out of use'} in version {then}, {then_date}.",
            "sv": f"Bytte namn till {card.renamed_to} i taxonomiversion {v}; "
                  f"{'ersatt' if replaced else 'slutade användas'} i version {then}, {then_date}.",
        }
        if not replaced:
            return Back(OUT_OF_USE, NONE, NO_REPLACEMENT, note)
        return Back(OUT_OF_USE, REPLACED_BY, today, note)
    in_version: Text = {"en": f"In taxonomy version {v}, {date}.", "sv": f"I taxonomiversion {v}, {date}."}
    added: Text = {"en": f"Added in taxonomy version {v}, {date}.", "sv": f"Tillkom i taxonomiversion {v}, {date}."}
    if card.kind == "new":
        if card.replaces:
            return Back(IN_USE, REPLACING, " · ".join(card.replaces), added)
        return Back(IN_USE, NONE, NEW_OCCUPATION, added)
    if card.kind == "discontinued":
        return Back(OUT_OF_USE, NONE, NO_REPLACEMENT, {
            "en": f"Went out of use in taxonomy version {v}, {date}.",
            "sv": f"Slutade användas i taxonomiversion {v}, {date}.",
        })
    if card.kind in ("synonym_added", "synonym_removed"):
        names = lists(card.added if card.kind == "synonym_added" else card.removed)
        many = len(card.added or card.removed) > 1
        en, sv = (("added", "tillagda" if many else "tillagd") if card.kind == "synonym_added"
                  else ("removed", "borttagna" if many else "borttagen"))
        note = {"en": f"{names['en']} {en} in taxonomy version {v}, {date}.",
                "sv": f"{names['sv']} {sv} i taxonomiversion {v}, {date}."}
        if card.kind == "synonym_added":
            return Back(IN_USE, SYNONYM_ADDED, today, note)
        return Back(OUT_OF_USE, SYNONYM_REMOVED, today, note)
    if card.kind == "renamed":
        return Back(OUT_OF_USE, RENAMED_TO, today, in_version)
    return Back(OUT_OF_USE, REPLACED_BY, today, in_version)


def tagged(text: Text, predicate: str) -> str:
    """ "…"@en , "…"@sv, aligned in the house style, English first."""
    return aligned(predicate, [f"{ttl_str(text[tag])}@{tag}" for tag in sorted(text, key=lambda t: (t != "en", t))])


CC0 = "<https://creativecommons.org/publicdomain/zero/1.0/>"


def comment_lines(lines: list[str], width: int = 96) -> list[str]:
    """Lines as a Turtle comment block, wrapped; "- " and "  " lines keep their indent."""
    out: list[str] = []
    for line in lines:
        indent = "    " if line.startswith(("- ", "  ")) else ""
        out += ["#" if not line else "# " + w
                for w in (textwrap.wrap(line, width, subsequent_indent=indent, break_on_hyphens=False,
                                        break_long_words=False) or [""])]
    return out


def notes_comment(left_out: list[LeftOut], met: Met) -> list[str]:
    """The deck's comment block: the names left out, and what else was left
    out or adjusted, why, and how often."""
    lines = [f"Left out: {counted(len(left_out), 'outdated names')} that a current occupation still has:"]
    lines += [f"  {x.label} ({x.concept_id}), version {x.version}: {LEFT_OUT_BECAUSE[x.reason]}"
              for x in left_out]
    lines += ["", "What was left out or adjusted, and why:"]
    lines += [f"- {counted(len(met[key]), title)}: {why}." for key, (_, title, why) in WHY.items() if met.get(key)]
    lines += ["", "Method:"] + [f"- {m}" for m in METHOD]
    return comment_lines(lines)


def counted(n: int, title: str) -> str:
    """ "3 old names of concepts …", or for one "1 old name of concepts …": a
    title is written plural, its first noun made singular for a count of 1."""
    if n != 1:
        return f"{n} {title}"
    one = re.sub(r"\b(names|concepts|changes)\b", lambda m: m.group(1)[:-1], title, count=1)
    return f"1 {one.replace(' that were ', ' that was ', 1)}"


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


PHRASES = {"replaced": "replaced", "renamed": "renamed", "synonym_added": "with a synonym added",
           "synonym_removed": "with a synonym removed", "discontinued": "gone with no replacement"}


@dataclass
class Released:
    """A card as a published version has it."""
    front: str
    back: Back
    created: str | None  # xsd:dateTime
    retired: bool
    subjects: list[str] = field(default_factory=list)  # IRIs, its dcterms:subject


TTL_ESCAPES = {"t": "\t", "b": "\b", "n": "\n", "r": "\r", "f": "\f"}


def ttl_unescape(s: str) -> str:
    """A Turtle string's text: its escapes (\\t, \\", \\u00e9, …) undone."""
    return re.sub(r"\\(?:u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|(.))",
                  lambda m: chr(int(m.group(1) or m.group(2), 16)) if m.group(3) is None
                  else TTL_ESCAPES.get(m.group(3), m.group(3)), s)


FIRST_CARD = re.compile(r"^<#[^>]+>\n    a solid-memo:Card ;$", re.M)
DISTRIBUTION = "\n<#turtle>\n"


@dataclass
class Previous:
    """The deck's newest version, which the next one is made from."""
    path: Path
    number: int  # its version: N of vN.ttl
    text: str
    cards: dict[str, Released]  # by id

    @property
    def taxonomy_versions(self) -> list[int]:
        """The taxonomy versions it records, oldest first."""
        return sorted(int(v) for v in re.findall(r"^<#taxonomy-version-(\d+)>", self.text, re.M))

    @property
    def card_section(self) -> str:
        """Its cards as written, from the first to the last, without the distribution after them."""
        start = FIRST_CARD.search(self.text)
        end = self.text.find(DISTRIBUTION)
        return self.text[start.start() if start else len(self.text):end if end >= 0 else len(self.text)].strip("\n")

    def objects(self, predicate: str) -> str:
        """The objects the deck itself (<>) has for a predicate, as written, its
        object list aligned as the predicate's length has it: carried over to
        the next version as they are."""
        deck = re.search(r"^<>\n((?:    .*\n?)+)", self.text, re.M)
        found = deck and re.search(rf"^    {predicate} ((?:.|\n {{6,}})*?) [;.]$", deck.group(1), re.M)
        if not found:
            sys.exit(f"{self.path}: the deck has no {predicate} to carry over")
        return found.group(1)

    def creator(self) -> tuple[str, str] | None:
        """The deck's creator, as (fragment id, name), if it has one. Only the
        name is carried over: a new version names no email (docs/deck-library.md#contact)."""
        found = re.search(r"^    dcterms:creator <#([^>]+)>", self.text, re.M)
        if not found:
            return None
        agent = re.search(rf'^<#{re.escape(found.group(1))}>\n(?:    .*\n)*?    foaf:name "((?:[^"\\]|\\.)*)"',
                          self.text, re.M)
        if not agent:
            sys.exit(f"{self.path}: the deck's creator <#{found.group(1)}> has no foaf:name")
        return found.group(1), ttl_unescape(agent.group(1))

    def reviews(self) -> list[str]:
        """Its review activities (<#review-N>), as written: they say how the
        texts carried over were made, so the next version keeps them."""
        return [m.group(0).rstrip("\n") for m in re.finditer(r"^<#review-\d+>\n(?:    .*\n?)+", self.text, re.M)]


def previous_version(deck: Path) -> Previous | None:
    """The deck's newest version, vN.ttl in its folder, if it has one."""
    numbered = sorted((int(m.group(1)), f) for f in deck.glob("v*.ttl")
                      if (m := re.fullmatch(r"v([1-9][0-9]*)\.ttl", f.name)))
    if not numbered:
        return None
    number, path = numbered[-1]
    text = path.read_text(encoding="utf-8")
    cards: dict[str, Released] = {}
    for m in re.finditer(r"^<#([^>]+)>\n((?:    .*\n?)+)", text, re.M):
        block = m.group(2)
        if not block.startswith("    a solid-memo:Card ;"):
            continue
        value = lambda p: (found := re.search(rf'^    {p} "((?:[^"\\]|\\.)*)"', block, re.M)) and ttl_unescape(found.group(1))

        def texts(p: str) -> Text:
            """A predicate's language-tagged literals: its line and the lines continuing its object list."""
            found = re.search(rf'^    {p} ((?:.|\n {{6,}})*?) [;.]$', block, re.M)
            return {tag: ttl_unescape(v) for v, tag in
                    re.findall(r'"((?:[^"\\]|\\.)*)"@([a-z-]+)', found.group(1))} if found else {}
        back = Back(texts("solid-memo:frontNote"), texts("solid-memo:backLabel"),
                    value("solid-memo:back") or "", texts("solid-memo:backNote"))
        about = re.search(r"^    dcterms:subject ((?:.|\n {6,})*?) [;.]$", block, re.M)
        cards[m.group(1)] = Released(value("solid-memo:front") or "", back, value("dcterms:created"),
                                     bool(re.search(r"^    owl:deprecated true", block, re.M)),
                                     re.findall(r"<([^>]+)>", about.group(1)) if about else [])
    return Previous(path, number, text, cards)


def retired_cards(cards: list[Card], previous: Previous) -> dict[str, Released]:
    """The cards of the previous version that no rule makes any longer, by id,
    retired as that version had them: never removed, so a copy keeps them and
    their reviews. A card retired before stays retired."""
    now = {c.id for c in cards}
    return {i: Released(r.front, r.back, r.created, True, r.subjects) for i, r in previous.cards.items()
            if i not in now}


def version_notes(cards: list[Card], retired: dict[str, Released], *, versions: dict[int, str], to: int,
                  previous: Previous) -> str:
    """The version's notes (adms:versionNotes): the taxonomy versions it adds,
    how many names are new, changed (and how) or retired, and the whole deck
    in numbers. What it left out and why is in the comment before <#generation>."""
    def summary(cs: list[Card], retiring: list[str], restored: list[str]) -> str:
        new = [c for c in cs if c.kind == "new"]
        changed = [c for c in cs if c.kind != "new"]
        how = ", ".join(f"{sum(1 for c in changed if c.kind == k)} {p}" for k, p in PHRASES.items()
                        if any(c.kind == k for c in changed))
        parts = [plural(len(new), "new name"),
                 plural(len(changed), "changed name") + (f" ({how})" if how else "")]
        if retiring:
            parts.append(f"{plural(len(retiring), 'card')} retired, no longer made by the rules "
                         f"({'; '.join(sorted(retiring, key=by_name))})")
        if restored:
            parts.append(f"{plural(len(restored), 'retired card')} brought back ({'; '.join(sorted(restored, key=by_name))})")
        return ", ".join(parts[:-1]) + " and " + parts[-1] if len(parts) > 1 else parts[0]

    recorded = previous.taxonomy_versions
    start, was, old = recorded[0], recorded[-1], previous.cards
    was_new = lambda i: is_new(old[i].back)
    # A name is new or changed in this version when its card is new, or its
    # card says something else of it than before: a new name gone out of use,
    # an outdated name back in use, or a card brought back.
    now_different = [c for c in cards if c.id not in old or old[c.id].retired
                     or (c.kind == "new") != was_new(c.id)]
    retiring = [r.front for i, r in retired.items() if not old[i].retired]
    restored = [c.front for c in cards if c.id in old and old[c.id].retired]
    backs = [c for c in cards if c.id in old and not old[c.id].retired and (c.kind == "new") == was_new(c.id)
             and old[c.id].back != back_of(c, versions)]
    relinked = [c for c in cards if c.id in old and old[c.id].subjects != [concept_iri(i) for i in sorted(c.concept_ids)]]
    added = f"versions {was + 1} to {to}" if to - was > 1 else f"version {to}"
    what = (f"Makes the deck's version {previous.number}, which covered taxonomy versions {start} to {was}, again "
            f"from the same versions" if to == was else
            f"Adds taxonomy {added} ({versions[to][:10]}) to the deck's version {previous.number}, which covered "
            f"taxonomy versions {start} to {was}")
    links = (f"; {plural(len(relinked), 'card')} naming other taxonomy concepts than before as what "
             f"{'it is' if len(relinked) == 1 else 'they are'} about (dcterms:subject)" if relinked else "")
    return (f"{what}: {summary(now_different, retiring, restored)}; "
            f"{plural(len(backs), 'back')} updated{links}. The whole deck now has {plural(len(cards), 'card')} in "
            f"use: {summary(cards, [], [])}" + (f"; and {plural(len(retired), 'retired card')}." if retired else "."))


def report(cards: list[Card], left_out: list[LeftOut], met: Met, *, versions: dict[int, str],
           since: int, to: int, verbose: bool) -> str:
    """What the run included, excluded and adjusted, and why, with examples."""
    by_kind = {kind: [c for c in cards if c.kind == kind] for kind in CARD_KINDS}
    split = sorted((c for c in by_kind["replaced"] if len(c.replacements) > 1), key=lambda c: -len(c.replacements))
    lines: list[str] = [
        f"Changes to occupation names in the labor market taxonomy, starting from version {since - 1} "
        f"({versions[since - 1][:10]}) up to version {to} ({versions[to][:10]}): {len(cards)} cards. "
        "Examples are the newest changes.",
    ]

    def entry(count: int, title: str, why: str, examples: list[str]) -> None:
        lines.append("")
        lines.append(f"- {count} {title}: {why}." if title.startswith("of them") else f"- {counted(count, title)}: {why}.")
        shown = examples if verbose else examples[:3]
        lines.extend(f"      {e}" for e in shown)
        if len(examples) > len(shown):
            lines.append(f"      … and {len(examples) - len(shown)} more (--verbose lists them all)")

    def newest_first(cs: list[Card]) -> list[Card]:
        return sorted(cs, key=lambda c: (-c.version, by_name(c.front)))

    def card_line(c: Card) -> str:
        if c.kind == "new":
            return f"{c.front} (version {c.version})" + (f", replacing {' · '.join(c.replaces)}" if c.replaces else "")
        return f"{c.front} → {' · '.join(c.replacements)} (version {c.version})"

    lines += ["", "INCLUDED"]
    for kind, (title, why) in CARD_KINDS.items():
        if not by_kind[kind]:
            continue
        entry(len(by_kind[kind]), title, why, [card_line(c) for c in newest_first(by_kind[kind])])
        if kind == "replaced":
            entry(len(split), "of them split into several names",
                  "the taxonomy replaced one name with more specific ones; the back lists them all",
                  [f"{c.front} → {len(c.replacements)} names: {' · '.join(c.replacements)}" for c in split])

    for section in ("excluded", "adjusted"):
        lines += ["", section.upper()]
        if section == "excluded":
            for reason in LEFT_OUT_BECAUSE:
                these = [x for x in left_out if x.reason == reason]
                if these:
                    _, title, why = WHY[reason]
                    entry(len(these), title, why,
                          [f"{x.label} ({x.concept_id}), version {x.version}" for x in these])
        for key, (where, title, why) in WHY.items():
            if where == section and key not in LEFT_OUT_BECAUSE and met.get(key):
                entry(len(met[key]), title, why, met[key])

    lines += ["", "WHY THE DECK IS BUILT THIS WAY"] + [f"- {m}" for m in METHOD]
    return "\n".join(w for line in lines
                     for w in (textwrap.wrap(line, 100, subsequent_indent=" " * (len(line) - len(line.lstrip()) + 2))
                               or [""]))


DECK = "swedish-labour-market-taxonomy-occupation-names"
DECK_DIR = Path(__file__).resolve().parent.parent / "decks" / DECK
SITE = "https://solid-memo.com/decks"
CONTACT = "https://github.com/solid-memo/website/issues"


def concept_iri(cid: str) -> str:
    return f"{CONCEPT}{cid}"


def card_lines(cards: list[Card], retired: dict[str, Released], versions: dict[int, str]) -> list[str]:
    """The cards, in use and retired, in the order of their names, each after an empty line;
    then, in id order, each concept a card in use is about that its back names successors of,
    with those successors (dcterms:isReplacedBy)."""
    written = [(card.id, card.front, back_of(card, versions), xsd_datetime(versions[card.version]), False,
                [concept_iri(cid) for cid in sorted(card.concept_ids)]) for card in cards]
    written += [(i, r.front, r.back, r.created, True, r.subjects) for i, r in retired.items()]
    out: list[str] = []
    for card_id_, front, back, created, is_retired, subjects in sorted(written, key=lambda w: (by_name(w[1]), w[0])):
        out += [
            "",
            f"<#{card_id_}>",
            "    a solid-memo:Card ;",
            "    solid-memo:formatVersion 4 ;",  # format 4: the names tagged as Swedish
            *([f'    dcterms:created "{created}"^^xsd:dateTime ;'] if created else []),
            *(["    owl:deprecated true ;"] if is_retired else []),
            *([f"    dcterms:subject {aligned('dcterms:subject', [f'<{s}>' for s in subjects])} ;"]
              if subjects else []),
            f"    solid-memo:front {ttl_str(front)}@sv ;",
            *([f"    solid-memo:frontNote {tagged(back.front_note, 'solid-memo:frontNote')} ;"]
              if back.front_note else []),
            *([f"    solid-memo:backLabel {tagged(back.label, 'solid-memo:backLabel')} ;"]
              if back.label else []),
            f"    solid-memo:back {ttl_str(back.text)}@sv" + (" ;" if back.note else " ."),
            *([f"    solid-memo:backNote {tagged(back.note, 'solid-memo:backNote')} ."] if back.note else []),
        ]
    successors = {cid: ids for card in cards for cid, ids in card.successors.items()}
    for cid in sorted(successors):
        objects = [f"<{concept_iri(r)}>" for r in sorted(successors[cid])]
        out += ["", f"<{concept_iri(cid)}>", f"    dcterms:isReplacedBy {aligned('dcterms:isReplacedBy', objects)} ."]
    return out


def deck_text(deck: str, number: int, cards: list[Card], retired: dict[str, Released], left_out: list[LeftOut],
              met: Met, *, versions: dict[int, str], checksums: dict[int, str], start: int, to: int,
              issued: str, notes: str, previous: Previous, provenance: Provenance) -> str:
    """Version `number` of the deck, a pure function of its inputs: the
    taxonomy versions read (by checksum), this script (by commit), the command
    line and the previous version. Nothing in it depends on when or where it is
    run, so running the recorded command at the recorded commit makes the file
    again byte for byte."""
    here = f"{SITE}/{deck}"
    creator = previous.creator()
    reviews = previous.reviews()
    reproduce = (f"git checkout {provenance.commit} && {provenance.command}" if provenance.commit
                 else f"{provenance.command} (a draft: the script was not committed)")
    out: list[str] = [
        f"@base <{here}/v{number}.ttl> .",
        "",
        "@prefix solid-memo: <https://solid-memo.com/ns/vocab/v1.ttl#> .",
        "@prefix dcterms:    <http://purl.org/dc/terms/> .",
        "@prefix prov:       <http://www.w3.org/ns/prov#> .",
        "@prefix rdfs:       <http://www.w3.org/2000/01/rdf-schema#> .",
        "@prefix xsd:        <http://www.w3.org/2001/XMLSchema#> .",
        "@prefix dcat:       <http://www.w3.org/ns/dcat#> .",
        "@prefix foaf:       <http://xmlns.com/foaf/0.1/> .",
        "@prefix topic:      <https://solid-memo.com/ns/vocab/topics.ttl#> .",
        "@prefix owl:        <http://www.w3.org/2002/07/owl#> .",
        "@prefix spdx:       <http://spdx.org/rdf/terms#> .",
        "@prefix adms:       <http://www.w3.org/ns/adms#> .",
        "@prefix vcard:      <http://www.w3.org/2006/vcard/ns#> .",
        "",
        "<>",
        "    a solid-memo:Deck ,",
        "      dcat:Dataset ;",
        f"    dcterms:title {previous.objects('dcterms:title')} ;",
        *([f"    dcterms:creator <#{creator[0]}> ;"] if creator else []),
        f"    dcterms:license {CC0} ;",
        f"    dcterms:description {previous.objects('dcterms:description')} ;",
        f"    prov:wasDerivedFrom <{TAXONOMY}> ;",
        "    prov:wasGeneratedBy <#generation> ;",
        f'    dcterms:modified "{xsd_datetime(versions[to])}"^^xsd:dateTime ;',
        "    dcat:theme "
        + aligned("dcat:theme", ["<http://publications.europa.eu/resource/authority/data-theme/EDUC>",
                                 "topic:labour-market"])
        + " ;",
        f"    dcat:keyword {previous.objects('dcat:keyword')} ;",
        "    dcterms:language "
        + aligned("dcterms:language", ["<http://publications.europa.eu/resource/authority/language/ENG>",
                                       "<http://publications.europa.eu/resource/authority/language/SWE>"])
        + " ;",
        "    solid-memo:studyDirection solid-memo:frontToBack ;",
        "    solid-memo:formatVersion 5 ;",  # format 5: keywords tagged with their language
        f'    dcat:version "{number}" ;',
        f"    dcat:prev <{here}/v{previous.number}.ttl> ;",
        f"    dcat:previousVersion <{here}/v{previous.number}.ttl> ;",
        f'    dcterms:issued "{issued}T00:00:00Z"^^xsd:dateTime ;',
        f"    adms:versionNotes {ttl_str(notes)} ;",
        f"    dcterms:publisher <{SITE}/index.ttl#solid-memo> ;",
        f"    dcat:inSeries <{SITE}/index.ttl#{deck}> ;",
        f"    dcat:isVersionOf <{SITE}/index.ttl#{deck}> ;",
        "    dcat:contactPoint <#contact> ;",
        "    dcat:distribution <#turtle> .",
        "",
    ]
    if creator:
        out += [f"<#{creator[0]}>", "    a foaf:Agent ;", f"    foaf:name {ttl_str(creator[1])} .", ""]
    out += [
        "<#contact>",
        "    a vcard:Kind ;",
        f"    vcard:hasURL <{CONTACT}> .",
        "",
        CC0,
        "    a dcterms:LicenseDocument .",
        "",
        "spdx:checksumAlgorithm_sha256",
        "    a spdx:ChecksumAlgorithm .",
        "",
        *comment_lines([
            "How this version was produced (W3C PROV-O). It is a pure function of the taxonomy versions "
            "read, this script, the command line and the deck's previous version, whose cards it keeps "
            "(retiring those no rule makes any longer) and whose title, description, keywords, creator "
            "and review activities it carries over. It records the script by commit and SHA-256, the "
            "command line, and every taxonomy version by its publication time, the query that fetched it "
            "and a SHA-256 of the answer, normalized as the script's checksum() describes; the commit "
            "holds the previous version. To make it again byte for byte, from the repository root:",
            f"  {reproduce}",
            "The script stops if a taxonomy version no longer matches its checksum here.",
            "",
            *[line.removeprefix("# ").removeprefix("#") for line in notes_comment(left_out, met)],
        ]),
        "<#generation>",
        "    a prov:Activity ;",
        *(["    prov:wasInformedBy "
           + aligned("prov:wasInformedBy", [r.split(">", 1)[0] + ">" for r in reviews]) + " ;"] if reviews else []),
        "    prov:used " + aligned("prov:used", [f"<#taxonomy-version-{v}>" for v in range(start, to + 1)]) + " ;",
        f"    prov:wasAssociatedWith <{provenance.script_url}> ;",
        f"    rdfs:comment {ttl_str(f'{provenance.command} ({provenance.python})')} .",
        "",
        *[line for review in reviews for line in (review, "")],
        f"<{provenance.script_url}>",
        "    a prov:SoftwareAgent ;",
        f"    dcterms:title {ttl_str(Path(provenance.script_url).name)} ;",
        "    spdx:checksum [ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; "
        f'spdx:checksumValue "{provenance.script_sha256}"^^xsd:hexBinary ] .',
        "",
        f"<{TAXONOMY}>",
        '    dcterms:title "Arbetsmarknadstaxonomi" ;',
        '    dcterms:creator "Arbetsförmedlingen" ;',
        f"    dcterms:license {CC0} .",
    ]
    for v in range(start, to + 1):
        out += [
            "",
            f"<#taxonomy-version-{v}>",
            "    a prov:Entity ;",
            f'    dcterms:title "Arbetsmarknadstaxonomi version {v}: {CONCEPT_TYPE} concepts, deprecated ones included" ;',
            f"    dcterms:isVersionOf <{TAXONOMY}> ;",
            f'    dcat:version "{v}" ;',
            f'    dcterms:issued "{versions[v]}"^^xsd:dateTime ;',
            f"    rdfs:seeAlso <{snapshot_url(v)}> ;",
            "    spdx:checksum [ a spdx:Checksum ; spdx:algorithm spdx:checksumAlgorithm_sha256 ; "
            f'spdx:checksumValue "{checksums[v]}"^^xsd:hexBinary ] .',
        ]
    out += card_lines(cards, retired, versions)
    out += [
        "",
        "<#turtle>",
        "    a dcat:Distribution ;",
        "    dcat:accessURL <> ;",
        "    dcat:downloadURL <> ;",
        "    dcat:mediaType <https://www.iana.org/assignments/media-types/text/turtle> ;",
        "    dcterms:format <http://publications.europa.eu/resource/authority/file-type/RDF_TURTLE> .",
    ]
    return "\n".join(out) + "\n"


# --------------------------------------------------------------------------- main


def check(previous: Previous) -> None:
    """For the weekly workflow (.github/workflows/taxonomy.yml), as key=value
    lines: the newest taxonomy version, the newest one the deck's newest
    version covers, whether the deck can be brought up to date, and the
    version that would."""
    newest = max(load_versions())
    released = previous.taxonomy_versions[-1]
    print(f"newest={newest}")
    print(f"released={released}")
    print(f"update={'true' if newest > released else 'false'}")
    print(f"next={previous.number + 1}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--deck", type=Path, default=None,
                    help=f"the deck's folder, which has its versions (default: decks/{DECK})")
    ap.add_argument("--to", type=int, default=None, help="newest taxonomy version to include (default: the newest)")
    ap.add_argument("--issued", default=None,
                    help="the date the version is published, YYYY-MM-DD (default: today, in UTC)")
    ap.add_argument("--cache-dir", type=Path, default=None,
                    help="keep fetched snapshots here and reuse them (checksums still apply)")
    ap.add_argument("--verbose", action="store_true",
                    help="list every name in the report, not just three examples of each kind")
    ap.add_argument("--allow-uncommitted", action="store_true",
                    help="write a draft although this script is not committed and unmodified")
    ap.add_argument("--notes-file", type=Path, default=None, help="also write the version notes to this file")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true",
                      help="write nothing: print, as key=value lines, the newest taxonomy version, the newest one "
                           "the deck's newest version covers, whether the deck can be brought up to date, and "
                           "the version that would")
    mode.add_argument("--verify", action="store_true",
                      help="write nothing: make the cards of the deck's newest version again, from the taxonomy "
                           "versions it records, and fail unless they come out byte for byte the same")
    args = ap.parse_args()
    deck = args.deck if args.deck is not None else DECK_DIR
    previous = previous_version(deck)
    if previous is None:
        ap.error(f"{deck} has no version (v1.ttl, …) to start from: the deck's first version is made by hand")
    recorded = previous.taxonomy_versions
    if not recorded:
        ap.error(f"{previous.path} records no taxonomy version: it was not made by this script")
    if args.check:
        check(previous)
        return
    issued = args.issued if args.issued is not None else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", issued):
        ap.error(f"--issued {issued}: give a date, YYYY-MM-DD")

    versions = load_versions()
    start = recorded[0]
    to = recorded[-1] if args.verify else args.to if args.to is not None else max(versions)
    if to not in versions:
        ap.error(f"taxonomy version {to} does not exist: the newest is {max(versions)}")
    if not args.verify and to < recorded[-1]:
        sys.exit(f"{previous.path.name} already covers taxonomy version {recorded[-1]}: there is nothing to add")
    snaps, checksums = {}, {}
    for v in range(start, to + 1):
        snaps[v], checksums[v] = load_snapshot(v, args.cache_dir)
    changed = {v: h for v, h in recorded_checksums(previous.text).items() if checksums.get(v) != h}
    if changed:
        sys.exit(f"{previous.path} was made from taxonomy versions whose content has changed since: "
                 + ", ".join(f"version {v} (was {h[:12]}…, now {checksums[v][:12]}…)" for v, h in sorted(changed.items()))
                 + ". A published version should never change; find out why before making the next one.")

    since = start + 1  # the first version whose changes can be seen
    cards, left_out, met = build_cards(snaps, since, to)
    retired = retired_cards(cards, previous)
    made = "\n".join(card_lines(cards, retired, versions)).strip("\n")
    if not args.verify and to == recorded[-1] and made == previous.card_section:
        sys.exit(f"{previous.path.name} already covers taxonomy version {to}, and its cards would come out the same: "
                 "there is nothing to add")
    if args.verify:
        if made != previous.card_section:
            diff = difflib.unified_diff(previous.card_section.splitlines(), made.splitlines(),
                                        previous.path.name, "made again", lineterm="", n=1)
            sys.exit(f"{previous.path}: its cards do not come out the same from taxonomy versions {start} to "
                     f"{to} (Python {sys.version.split()[0]}, Unicode {unicodedata.unidata_version}):\n"
                     + "\n".join(list(diff)[:60]))
        print(f"{previous.path.name}: its {len(previous.cards)} cards come out byte for byte the same from "
              f"taxonomy versions {start} to {to}", file=sys.stderr)
        return

    number = previous.number + 1
    options = [*(["--deck", str(args.deck)] if args.deck is not None else []), "--to", str(to), "--issued", issued]
    provenance = script_provenance(args.allow_uncommitted, options)
    print(report(cards, left_out, met, versions=versions, since=since, to=to, verbose=args.verbose),
          file=sys.stderr)
    notes = version_notes(cards, retired, versions=versions, to=to, previous=previous)
    output = deck / f"v{number}.ttl"
    output.write_text(deck_text(deck.resolve().name, number, cards, retired, left_out, met, versions=versions,
                                checksums=checksums, start=start, to=to, issued=issued, notes=notes,
                                previous=previous, provenance=provenance), encoding="utf-8")
    if args.notes_file is not None:
        args.notes_file.write_text(notes + "\n", encoding="utf-8")
    print(f"\nwrote {output}: {len(cards)} cards in use, {len(retired)} retired\n\nVERSION NOTES\n"
          + textwrap.fill(notes, 100, initial_indent="  ", subsequent_indent="  ")
          + "\n\nThen: npm run format:turtle && npm run library (docs/deck-library.md#the-taxonomy-deck)",
          file=sys.stderr)


if __name__ == "__main__":
    main()
