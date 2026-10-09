import { describe, expect, it } from "vitest";
import { card, chapter, distractor, iri, model, RELEASE, step, text } from "../testing/releaseModel";
import { keptInIndex, lastIssued, seriesEntry } from "./seriesEntry";

const SERIES = "https://solid-memo.com/decks/index.ttl#solid";
const V2 = "https://solid-memo.com/decks/solid/v2.ttl";
const first = model({
  title: [text("Solid 1")],
  description: [text("First.")],
  version: [iri("https://example.com/odd"), text("1", "")],
  issued: [text("2026-10-01T10:00:00Z", "")],
  versionNotes: [text("First release.", "")],
});
const second = model({
  url: V2,
  title: [text("Solid")],
  description: [text("About Solid.")],
  themes: [iri("https://example.com/theme")],
  keywords: [text("pods")],
  issued: [text("2026-10-02T10:00:00Z", "")],
  cards: [card("se"), card("no", { retired: true }), card("fi")],
});

describe("seriesEntry", () => {
  it("states the current release's description and the series' releases, summarising the older ones", () => {
    expect(seriesEntry(SERIES, [first, second])).toEqual({
      series: SERIES,
      title: [text("Solid")],
      description: [text("About Solid.")],
      themes: [iri("https://example.com/theme")],
      keywords: [text("pods")],
      first: RELEASE,
      last: V2,
      versions: [RELEASE, V2],
      older: [
        {
          url: RELEASE,
          title: [text("Solid 1")],
          description: [text("First.")],
          version: [text("1", "")],
          issued: [text("2026-10-01T10:00:00Z", "")],
          versionNotes: [text("First release.", "")],
        },
      ],
      cardCount: 2,
    });
  });

  it("summarises an older release by what it states", () => {
    expect(seriesEntry(SERIES, [model(), second]).older[0]).toEqual({ url: RELEASE, title: [], description: [], version: [], issued: [], versionNotes: [] });
  });
});

describe("keptInIndex", () => {
  const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
  const COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";
  const kept = keptInIndex(
    model({
      cards: [card("se")],
      chapters: [chapter("ch-1", 0)],
      steps: [step("s-1", "ch-1", 0, [])],
      distractors: [distractor("se-a"), distractor("named", { typed: false })],
      activities: [
        { iri: `${RELEASE}#compilation`, generating: true },
        { iri: `${RELEASE}#review`, generating: false },
      ],
    }),
  );

  it("keeps the release and the nodes it describes, but no comment", () => {
    expect(kept(RELEASE, RDF_TYPE)).toBe(true);
    expect(kept(`${RELEASE}#anton`, "http://xmlns.com/foaf/0.1/name")).toBe(true);
    expect(kept(`${RELEASE}#named`, RDF_TYPE)).toBe(true);
    expect(kept(`${RELEASE}#anton`, COMMENT)).toBe(false);
  });

  it("leaves out the cards, chapters, steps and distractors", () => {
    for (const id of ["se", "ch-1", "s-1", "se-a"]) expect(kept(`${RELEASE}#${id}`, RDF_TYPE), id).toBe(false);
  });

  it("keeps of the activities only the type of the one that generated the release", () => {
    expect(kept(`${RELEASE}#compilation`, RDF_TYPE)).toBe(true);
    expect(kept(`${RELEASE}#compilation`, "http://www.w3.org/ns/prov#used")).toBe(false);
    expect(kept(`${RELEASE}#review`, RDF_TYPE)).toBe(false);
  });
});

it("gives when the latest release was issued, each by the first time it states", () => {
  const twice = { ...second, issued: [text("2026-10-03T10:00:00Z", ""), text("2027-01-01T00:00:00Z", "")] };
  expect(lastIssued([twice, first])).toBe("2026-10-03T10:00:00Z");
  expect(lastIssued([model()])).toBeUndefined();
});
