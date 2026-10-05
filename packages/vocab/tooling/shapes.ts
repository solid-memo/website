import type { Quad, Quad_Object } from "n3";
import {
  listMembers,
  localName,
  objectsOf,
  parseTurtle,
  RDF_TYPE,
  subjectsOfType,
  type TurtleFile,
} from "@solid-memo/turtle/rdf";
import { GENERATED_HEADER, SM_NS } from "./vocab.ts";
import { SHAPES_POD } from "../src/pods.ts";

/**
 * The SHACL shape documents (<SHAPES_POD><class>/v<N>) as the generators see
 * them, and the two TypeScript modules rendered from them: the record
 * types (domain) and the descriptors (infrastructure). See docs/shapes.md
 * for the conventions the parser relies on.
 */

export const SHAPES_BASE = SHAPES_POD;
const SH = "http://www.w3.org/ns/shacl#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const RDF_LANG_STRING = "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString";
const RDFS_COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";

/**
 * The vocabularies a shape's sh:class may come from: Solid Memo's own,
 * and the standard ones whose classes it writes (DCAT catalogues,
 * datasets and distributions; FOAF agents).
 */
export const CLASS_NAMESPACES = [
  SM_NS,
  "http://www.w3.org/ns/dcat#",
  "http://xmlns.com/foaf/0.1/",
];

export type TermKind =
  | "string"
  | "integer"
  | "decimal"
  | "dateTime"
  | "boolean"
  | "iri"
  | "enum"
  | "iriEnum"
  | "text"
  | "anyText";
export type Cardinality = "one" | "optional" | "many";
export type ShapeContext = "pod" | "library" | "any";

export interface ShapeField {
  name: string;
  predicate: string;
  kind: TermKind;
  cardinality: Cardinality;
  values?: string[];
}

export interface ShapeModel {
  /** sh:name, e.g. "LibraryDeckV2". */
  name: string;
  /** The record kind, e.g. "libraryDeck". */
  shape: string;
  version: number;
  targetClass: string;
  /** Further rdf:types a conforming subject has (sh:hasValue on rdf:type). */
  additionalTypes: string[];
  /** Predicates a conforming subject never has (sh:maxCount 0). */
  absent: string[];
  shapeIri: string;
  /** Path on the shapes' pod, e.g. "deck/v2". */
  shapeDocument: string;
  context: ShapeContext;
  comment: string;
  fields: ShapeField[];
}

const DATATYPES: Record<string, TermKind> = {
  [`${XSD}string`]: "string",
  [`${XSD}integer`]: "integer",
  [`${XSD}decimal`]: "decimal",
  [`${XSD}dateTime`]: "dateTime",
  [`${XSD}boolean`]: "boolean",
  [RDF_LANG_STRING]: "text",
};

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function integerOf(object: Quad_Object | undefined): number | undefined {
  return object === undefined ? undefined : Number(object.value);
}

/** Every leaf node shape (one with an sh:name) of every file, sorted by shape then version. */
export function parseShapes(files: readonly TurtleFile[]): ShapeModel[] {
  const models = files.flatMap((file) => parseShapeFile(file));
  const names = new Set<string>();
  for (const model of models) {
    if (names.has(model.name)) {
      throw new Error(`shapes: "${model.name}" is defined twice.`);
    }
    names.add(model.name);
  }
  return models.sort(
    (a, b) => a.shape.localeCompare(b.shape) || a.version - b.version,
  );
}

function parseShapeFile(file: TurtleFile): ShapeModel[] {
  const base = `${SHAPES_BASE}${file.path}`;
  const quads = parseTurtle(file.turtle, base);
  const fail = (message: string): never => {
    throw new Error(`${base}: ${message}`);
  };
  const pathVersion = /\/v(\d+)$/.exec(file.path);
  if (pathVersion === null) fail("expected a path like <class>/v<N>.");
  const fileVersion = Number(pathVersion![1]);
  return subjectsOfType(quads, `${SH}NodeShape`)
    .filter((iri) => objectsOf(quads, iri, `${SH}name`).length > 0)
    .map((iri): ShapeModel => {
      const name = objectsOf(quads, iri, `${SH}name`)[0].value;
      const parsed = /^([A-Z][A-Za-z]*)V(\d+)$/.exec(name);
      if (parsed === null) fail(`sh:name "${name}" is not <Kind>V<N>.`);
      const version = Number(parsed![2]);
      if (version !== fileVersion) {
        fail(`"${name}" does not match the file's version ${fileVersion}.`);
      }
      const targetClass = objectsOf(quads, iri, `${SH}class`)[0];
      if (
        targetClass === undefined ||
        !CLASS_NAMESPACES.some((ns) => targetClass.value.startsWith(ns))
      ) {
        fail(`"${name}" needs an sh:class in the Solid Memo, DCAT or FOAF vocabulary.`);
      }
      const fragment = localName(iri);
      const context: ShapeContext =
        fragment === "inPod" ? "pod" : fragment === "inLibrary" ? "library" : "any";
      const fields: ShapeField[] = [];
      const additionalTypes: string[] = [];
      const absent: string[] = [];
      let versionAsserted = false;
      for (const property of objectsOf(quads, iri, `${SH}property`)) {
        const field = parseProperty(quads, property.value, version, fail);
        if (field === "formatVersion") {
          versionAsserted = true;
          continue;
        }
        if ("type" in field) {
          additionalTypes.push(field.type);
          continue;
        }
        if ("absent" in field) {
          absent.push(field.absent);
          continue;
        }
        if (fields.some((f) => f.name === field.name)) {
          fail(`"${name}" has two fields named "${field.name}".`);
        }
        fields.push(field);
      }
      if (!versionAsserted) fail(`"${name}" does not assert sm:formatVersion.`);
      return {
        name,
        shape: lowerFirst(parsed![1]),
        version,
        targetClass: targetClass!.value,
        additionalTypes,
        absent,
        shapeIri: iri,
        shapeDocument: file.path,
        context,
        comment: objectsOf(quads, iri, RDFS_COMMENT)[0]?.value ?? "",
        fields,
      };
    });
}

/**
 * A property shape as a field: `{ absent }` for a predicate the subject
 * must not have (sh:maxCount 0), which the writer removes;
 * "formatVersion" for the version assertion (checked, not a field); and
 * `{ type }` for an rdf:type the subject must also have (sh:hasValue),
 * which the writer adds.
 */
function parseProperty(
  quads: readonly Quad[],
  shape: string,
  version: number,
  fail: (message: string) => never,
): ShapeField | "formatVersion" | { type: string } | { absent: string } {
  const of = (predicate: string) => objectsOf(quads, shape, `${SH}${predicate}`);
  const path = of("path")[0];
  if (path === undefined || path.termType !== "NamedNode") {
    fail(`<${shape}> has no sh:path IRI.`);
  }
  const predicate = path!.value;
  const minCount = integerOf(of("minCount")[0]) ?? 0;
  const maxCount = integerOf(of("maxCount")[0]);
  const inList = of("in")[0];
  const values = inList === undefined ? undefined : listMembers(quads, inList);
  if (predicate === `${SM_NS}formatVersion`) {
    const stated =
      version === 1
        ? values?.map((v) => Number(v.value))
        : of("hasValue").map((v) => Number(v.value));
    if (stated?.length !== 1 || stated[0] !== version) {
      fail(
        version === 1
          ? "format 1 asserts its version with sh:in ( 1 )."
          : `format ${version} asserts its version with sh:hasValue ${version}.`,
      );
    }
    return "formatVersion";
  }
  if (predicate === RDF_TYPE) {
    const type = of("hasValue")[0];
    if (type === undefined || type.termType !== "NamedNode") {
      fail(`<${shape}> constrains rdf:type without an sh:hasValue class.`);
    }
    return { type: type!.value };
  }
  if (maxCount === 0) return { absent: predicate };
  const datatype = of("datatype")[0]?.value;
  const nodeKind = of("nodeKind")[0]?.value;
  const alternatives = of("or")[0];
  let kind: TermKind | undefined;
  if (datatype !== undefined) kind = DATATYPES[datatype];
  else if (nodeKind === `${SH}IRI`) kind = "iri";
  else if (alternatives !== undefined) kind = alternativesKind(quads, alternatives);
  if (kind === undefined) {
    fail(`<${shape}> has no supported sh:datatype or sh:nodeKind sh:IRI.`);
  }
  if (values !== undefined && kind !== "string" && kind !== "iri") {
    fail(`<${shape}> uses sh:in, which is only supported for xsd:string and IRIs.`);
  }
  if (values !== undefined && values.some((v) => (v.termType === "NamedNode") !== (kind === "iri"))) {
    fail(`<${shape}> lists sh:in values of another kind than the field's.`);
  }
  const name = of("name")[0]?.value ?? localName(predicate);
  // A text with one value per language (sh:uniqueLang true) is one field
  // however many languages it is in: required or not. Without
  // sh:uniqueLang it holds several values per language ("many").
  const textual = kind === "text" || kind === "anyText";
  const uniqueLang = of("uniqueLang")[0]?.value === "true";
  if (textual && !uniqueLang && maxCount !== undefined) {
    fail(`<${shape}> limits a text with several values per language; drop sh:maxCount or add sh:uniqueLang true.`);
  }
  const cardinality: Cardinality = textual
    ? uniqueLang ? (minCount >= 1 ? "one" : "optional") : "many"
    : maxCount === undefined ? "many" : minCount >= 1 ? "one" : "optional";
  if (cardinality === "many" && !textual && kind !== "string" && kind !== "iri") {
    fail(`<${shape}> repeats a ${kind}; only strings, IRIs and texts may repeat.`);
  }
  return {
    name,
    predicate,
    kind: values === undefined ? kind! : kind === "iri" ? "iriEnum" : "enum",
    cardinality,
    ...(values === undefined ? {} : { values: values.map((v) => v.value) }),
  };
}

/**
 * The kind sh:or over datatypes makes: untagged or language-tagged text
 * ( [ sh:datatype xsd:string ] [ sh:datatype rdf:langString ] ) is
 * "anyText"; nothing else is supported.
 */
function alternativesKind(quads: readonly Quad[], list: Quad_Object): TermKind | undefined {
  const datatypes = listMembers(quads, list)
    .map((member) => objectsOf(quads, member.value, `${SH}datatype`)[0]?.value)
    .sort();
  return datatypes.length === 2 && datatypes[0] === RDF_LANG_STRING && datatypes[1] === `${XSD}string`
    ? "anyText"
    : undefined;
}

function tsType(field: ShapeField): string {
  if (field.kind === "text" || field.kind === "anyText") {
    return field.cardinality === "many" ? "LangTexts" : "LangText";
  }
  const scalar =
    field.kind === "enum" || field.kind === "iriEnum"
      ? field.values!.map((v) => JSON.stringify(v)).join(" | ")
      : field.kind === "integer" || field.kind === "decimal"
        ? "number"
        : field.kind === "boolean"
          ? "boolean"
          : "string";
  return field.cardinality === "many"
    ? field.kind === "enum" || field.kind === "iriEnum"
      ? `readonly (${scalar})[]`
      : `readonly ${scalar}[]`
    : scalar;
}

function constName(model: ShapeModel): string {
  return model.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

function byShape(models: readonly ShapeModel[]): Map<string, ShapeModel[]> {
  const groups = new Map<string, ShapeModel[]>();
  for (const model of models) {
    groups.set(model.shape, [...(groups.get(model.shape) ?? []), model]);
  }
  for (const [shape, versions] of groups) {
    versions.forEach((model, index) => {
      if (model.version !== index + 1) {
        throw new Error(
          `shapes: "${shape}" versions must run 1, 2, … without gaps; found ${versions.map((m) => m.version).join(", ")}.`,
        );
      }
    });
  }
  return groups;
}

/** The domain module: one record interface per shape version, plus the unions. */
export function renderDomainTypes(models: readonly ShapeModel[]): string {
  const groups = byShape(models);
  const shapes = [...groups.keys()];
  const lines = [
    GENERATED_HEADER(`${SHAPES_POD}<class>/v<N>`),
    "/**",
    " * A text in one or more languages (rdf:langString values): language tag,",
    " * lower case (\"en\", \"sv\", \"en-gb\"), to the text in that language.",
    " * Where a shape also allows untagged text (a card's sides), the empty tag",
    " * (\"\") holds it.",
    " */",
    "export type LangText = Readonly<Record<string, string>>;",
    "",
    "/**",
    " * Several texts per language (rdf:langString values without",
    " * sh:uniqueLang, such as a deck's keywords): language tag, lower case, to",
    " * the texts in that language, in stored order. Where a shape also allows",
    " * untagged text, the empty tag (\"\") holds it; {} is none.",
    " */",
    "export type LangTexts = Readonly<Record<string, readonly string[]>>;",
    "",
    "/** The record kinds the shapes describe (see docs/shapes.md). */",
    `export type ShapeName = ${shapes.map((s) => JSON.stringify(s)).join(" | ")};`,
    "",
    "/** The shape version this app writes for each kind. */",
    "export const LATEST_VERSION = {",
    ...shapes.map((s) => `  ${s}: ${groups.get(s)!.length},`),
    "} as const;",
    "",
  ];
  for (const model of models) {
    lines.push(`/** ${model.comment} */`);
    lines.push(`export interface ${model.name} {`);
    for (const field of model.fields) {
      const optional = field.cardinality === "optional" ? "?" : "";
      lines.push(`  readonly ${field.name}${optional}: ${tsType(field)};`);
    }
    lines.push("}", "");
  }
  for (const [shape, versions] of groups) {
    const union = versions
      .map((m) => `{ version: ${m.version}; data: ${m.name} }`)
      .join(" | ");
    lines.push(`export type ${upperFirst(shape)}Record = ${union};`);
  }
  lines.push(
    "",
    "/** A record of any version, by kind. */",
    "export type VersionedRecord = {",
    ...shapes.map((s) => `  ${s}: ${upperFirst(s)}Record;`),
    "};",
    "",
    "/** The latest record of each kind: what this app writes. */",
    "export type LatestRecord = {",
    ...shapes.map((s) => `  ${s}: ${groups.get(s)!.at(-1)!.name};`),
    "};",
    "",
  );
  return lines.join("\n");
}

function upperFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The infrastructure module: one descriptor per shape version and the registry. */
export function renderDescriptors(models: readonly ShapeModel[]): string {
  const groups = byShape(models);
  const lines = [
    GENERATED_HEADER(`${SHAPES_POD}<class>/v<N>`),
    `import type { ShapeDescriptor } from "./shapeDescriptor.ts";`,
    "import type {",
    ...models.map((m) => `  ${m.name},`),
    `} from "./types.generated.ts";`,
    "",
  ];
  for (const model of models) {
    lines.push(`export const ${constName(model)}: ShapeDescriptor<${model.name}> = {`);
    lines.push(`  shape: ${JSON.stringify(model.shape)},`);
    lines.push(`  version: ${model.version},`);
    lines.push(`  targetClass: ${JSON.stringify(model.targetClass)},`);
    lines.push(`  additionalTypes: ${JSON.stringify(model.additionalTypes)},`);
    lines.push(`  absent: ${JSON.stringify(model.absent)},`);
    lines.push(`  shapeIri: ${JSON.stringify(model.shapeIri)},`);
    lines.push(`  shapeDocument: ${JSON.stringify(model.shapeDocument)},`);
    lines.push(`  context: ${JSON.stringify(model.context)},`);
    lines.push("  fields: [");
    for (const field of model.fields) {
      const parts = [
        `name: ${JSON.stringify(field.name)}`,
        `predicate: ${JSON.stringify(field.predicate)}`,
        `kind: ${JSON.stringify(field.kind)}`,
        `cardinality: ${JSON.stringify(field.cardinality)}`,
        ...(field.values === undefined
          ? []
          : [`values: ${JSON.stringify(field.values)}`]),
      ];
      lines.push(`    { ${parts.join(", ")} },`);
    }
    lines.push("  ],", "};", "");
  }
  lines.push("/** Every descriptor by kind and version. */", "export const SHAPES = {");
  for (const [shape, versions] of groups) {
    lines.push(
      `  ${shape}: { ${versions.map((m) => `${m.version}: ${constName(m)}`).join(", ")} },`,
    );
  }
  lines.push(
    "} as const;",
    "",
    "/** Every descriptor, for selection by class, version and context. */",
    "export const ALL_SHAPES: readonly ShapeDescriptor[] = [",
    ...models.map((m) => `  ${constName(m)},`),
    "];",
    "",
  );
  return lines.join("\n");
}
