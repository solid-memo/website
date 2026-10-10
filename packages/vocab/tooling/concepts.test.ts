import { describe, expect, it } from "vitest";
import {
  checkEveryConceptInAScheme,
  parseConceptSchemes,
  parseReferenceConcepts,
  renderConcepts,
} from "./concepts.ts";

const BASE = "https://example.com/vocab/colours";
const HEAD = `
@prefix c:       <${BASE}#> .
@prefix skos:    <http://www.w3.org/2004/02/skos/core#> .
@prefix dcterms: <http://purl.org/dc/terms/> .
`;
const SCHEME = `${HEAD}
<> a skos:ConceptScheme ; dcterms:title "Colours"@en, "Färger"@sv ; skos:definition "Colours <&> \\"hues\\"."@en .
c:red a skos:Concept ; skos:prefLabel "Röd"@sv, "Red"@en ; skos:definition "Blood."@en, "Blod."@sv ; skos:notation "r" ; skos:inScheme <> .
c:crimson a skos:Concept ; skos:prefLabel "Crimson"@en, "Karmosin"@sv, "Crimson"@en-gb ; skos:definition "Dark red."@en, "Mörkröd."@sv ; skos:broader c:red ; skos:inScheme <> .
`;

describe("parseConceptSchemes", () => {
  it("reads each scheme and its concepts in document order, English first", () => {
    expect(parseConceptSchemes(SCHEME, BASE)).toEqual([
      {
        name: "COLOURS",
        iri: BASE,
        title: "Colours",
        definition: 'Colours <&> "hues".',
        concepts: [
          {
            iri: `${BASE}#red`,
            label: { en: "Red", sv: "Röd" },
            definition: { en: "Blood.", sv: "Blod." },
            notation: "r",
          },
          {
            iri: `${BASE}#crimson`,
            label: { en: "Crimson", "en-gb": "Crimson", sv: "Karmosin" },
            definition: { en: "Dark red.", sv: "Mörkröd." },
            broader: `${BASE}#red`,
          },
        ],
      },
    ]);
  });

  it("names a camel-case scheme in upper snake case", () => {
    const turtle = `${HEAD} c:StudyDirections a skos:ConceptScheme ; dcterms:title "S"@en ; skos:definition "S"@en .`;
    expect(parseConceptSchemes(turtle, BASE)[0].name).toBe("STUDY_DIRECTIONS");
  });

  it("names a scheme that is its document by the document's name, without its extension", () => {
    expect(parseConceptSchemes(SCHEME, `${BASE}.ttl`)[0].name).toBe("COLOURS");
  });

  it("requires English labels", () => {
    const turtle = `${HEAD} <> a skos:ConceptScheme ; dcterms:title "Färger"@sv ; skos:definition "x"@en .`;
    expect(() => parseConceptSchemes(turtle, BASE)).toThrow(
      `${BASE}: <${BASE}> has no English title.`,
    );
  });

  it("requires a concept's label and definition in every language of the scheme's title, untagged text not counting", () => {
    const turtle = `${HEAD} <> a skos:ConceptScheme ; dcterms:title "Colours"@en, "Färger"@sv ; skos:definition "x"@en .
c:red a skos:Concept ; skos:prefLabel "Red"@en, "Röd" ; skos:definition "Blood."@en, "Blod."@sv ; skos:inScheme <> .`;
    expect(() => parseConceptSchemes(turtle, BASE)).toThrow(`${BASE}: <${BASE}#red> has no prefLabel in sv.`);
  });
});

describe("checkEveryConceptInAScheme", () => {
  it("accepts concepts that belong to a scheme and rejects strays", () => {
    const schemes = parseConceptSchemes(SCHEME, BASE);
    expect(() => checkEveryConceptInAScheme([{ turtle: SCHEME, baseIri: BASE }], schemes)).not.toThrow();
    const stray = `${SCHEME} c:blue a skos:Concept ; skos:prefLabel "Blue"@en .`;
    expect(() => checkEveryConceptInAScheme([{ turtle: stray, baseIri: BASE }], schemes)).toThrow(
      `${BASE}: <${BASE}#blue> is in none of the concept schemes.`,
    );
  });
});

describe("renderConcepts", () => {
  it("renders one constant per scheme", () => {
    expect(renderConcepts(["vocab/colours.ttl"], parseConceptSchemes(SCHEME, BASE))).toContain(
      `/** Colours <&> "hues". */
export const COLOURS = {
  iri: "${BASE}",
  title: "Colours",
  concepts: [
    {
      iri: "${BASE}#red",
      label: { en: "Red", sv: "Röd" },
      definition: { en: "Blood.", sv: "Blod." },
      notation: "r",
    },
    {
      iri: "${BASE}#crimson",
      label: { en: "Crimson", "en-gb": "Crimson", sv: "Karmosin" },
      definition: { en: "Dark red.", sv: "Mörkröd." },
      broader: "${BASE}#red",
    },
  ],
} as const satisfies ConceptScheme;
`,
    );
  });
});

const TABLE = "http://publications.europa.eu/resource/authority/language";
const EXTERNAL = `${HEAD}
<${TABLE}> a skos:ConceptScheme ; dcterms:title "Language"@en .
<${TABLE}/ENG> a skos:Concept ; skos:prefLabel "English"@en ; skos:inScheme <${TABLE}> .
<${TABLE}/SWE> a skos:Concept ; skos:prefLabel "Svenska"@sv, "Swedish"@en ; skos:inScheme <${TABLE}> .
<http://example.com/theme/EDUC> a skos:Concept ; skos:prefLabel "Education"@en ; skos:inScheme <http://example.com/theme> .
`;

describe("parseReferenceConcepts", () => {
  it("reads a scheme's entries in document order, each with its code and English label", () => {
    expect(parseReferenceConcepts(EXTERNAL, BASE, TABLE)).toEqual([
      { iri: `${TABLE}/ENG`, code: "ENG", label: "English" },
      { iri: `${TABLE}/SWE`, code: "SWE", label: "Swedish" },
    ]);
  });

  it("requires an English label", () => {
    expect(() => parseReferenceConcepts(`${HEAD}<${TABLE}/DEU> a skos:Concept ; skos:prefLabel "Deutsch"@de ; skos:inScheme <${TABLE}> .`, BASE, TABLE)).toThrow(
      `<${TABLE}/DEU> has no English prefLabel.`,
    );
  });
});

describe("renderConcepts with reference schemes", () => {
  it("renders each as a list of its entries", () => {
    const rendered = renderConcepts([], [], [
      { scheme: { name: "EU_LANGUAGES", iri: TABLE, definition: "Languages." }, concepts: parseReferenceConcepts(EXTERNAL, BASE, TABLE) },
    ]);
    expect(rendered).toContain("export interface ReferenceConcept {");
    expect(rendered).toContain(`/** Languages. */
export const EU_LANGUAGES: readonly ReferenceConcept[] = [
  { iri: "${TABLE}/ENG", code: "ENG", label: "English" },
  { iri: "${TABLE}/SWE", code: "SWE", label: "Swedish" },
];
`);
  });

  it("renders no reference type without reference schemes", () => {
    expect(renderConcepts([], [])).not.toContain("ReferenceConcept");
  });
});
