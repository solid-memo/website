import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DataFactory, Store, type Quad } from "n3";
import { createEngine, type ShapeEngine } from "../src/engine.ts";
import {
  coreOnly,
  PROFILES,
  REFERENCE_DATA,
  type ProfileName,
} from "../src/profiles.ts";
import { pickShape } from "../src/registry.ts";
import { ALL_SHAPES } from "@solid-memo/vocab/descriptors.generated";
import type { ShapeContext } from "@solid-memo/vocab/shapeDescriptor";
import { RDF_TYPE, parseTurtle } from "@solid-memo/turtle/rdf";
import { SM_NS } from "@solid-memo/vocab/tooling/vocab";
import { readSiteTurtle, SHAPES_BASE, SITE_VENDOR, VOCAB_BASE } from "@solid-memo/vocab/tooling/sources";
import { shown } from "@solid-memo/domain/langText";

/**
 * SHACL validation in node (tests and tools): Solid Memo's shapes,
 * read from the repository's ns/, applied to a Turtle document one
 * subject at a time, with the shape chosen by class and format version exactly as
 * the app chooses it; and the vendored profiles (DCAT-AP, SKOS) applied
 * to a whole document.
 */

/** A document the site publishes from this repository, parsed at its own address. */
async function readSiteQuads(url: string): Promise<Quad[]> {
  return parseTurtle(await readSiteTurtle(url), url);
}

/** Every shape the app knows (ALL_SHAPES), in one graph. */
export async function loadShapesGraph(): Promise<Store> {
  const documents = [...new Set(ALL_SHAPES.map((d) => `${SHAPES_BASE}${d.shapeDocument}`))];
  return new Store((await Promise.all(documents.map(readSiteQuads))).flat());
}

export async function loadEngine(): Promise<ShapeEngine> {
  return createEngine(await loadShapesGraph());
}

/** The classes Solid Memo's shapes are picked by: its own, and the DCAT and FOAF ones it writes. */
const SHAPED_CLASSES = new Set(ALL_SHAPES.map((d) => d.targetClass));

/**
 * Validate every Solid Memo subject of a document: one with a Solid
 * Memo type, or of a DCAT or FOAF class a shape describes (a catalogue,
 * an agent, a distribution). Throws one Error listing every problem,
 * `label` first, so a broken file names itself. Other subjects (a
 * source's description, say) are not checked; a subject in a format
 * this app does not know, or typed with a Solid Memo term that is no
 * class, is a problem of its own.
 */
export async function validateTurtleDocument(
  label: string,
  quads: readonly Quad[],
  engine: ShapeEngine,
  context: Exclude<ShapeContext, "any">,
): Promise<void> {
  const data = new Store([...quads]);
  const subjects = [
    ...new Set(
      quads
        .filter(
          (q) =>
            q.predicate.value === RDF_TYPE &&
            (q.object.value.startsWith(SM_NS) || SHAPED_CLASSES.has(q.object.value)),
        )
        .map((q) => q.subject.value),
    ),
  ];
  const problems: string[] = [];
  for (const subject of subjects) {
    // The store's index, not a scan of the document per subject: a
    // release can hold thousands of cards.
    const node = DataFactory.namedNode(subject);
    const types = data.getObjects(node, DataFactory.namedNode(RDF_TYPE), null).map((o) => o.value);
    const version = Number(
      data.getObjects(node, DataFactory.namedNode(`${SM_NS}formatVersion`), null)[0]?.value ?? "1",
    );
    const pick = pickShape(types, version, context);
    if (pick.kind === "untyped") {
      problems.push(`<${subject}> is typed with a Solid Memo term that names no class.`);
      continue;
    }
    if (pick.kind === "unknown-version") {
      problems.push(
        `<${subject}> is ${pick.shape} format ${pick.version}; this app knows formats 1–${pick.latest}.`,
      );
      continue;
    }
    for (const violation of await engine.validateNode(
      data,
      subject,
      pick.descriptor.shapeIri,
    )) {
      const where = violation.path === undefined ? "" : ` (${violation.path})`;
      problems.push(`<${subject}>${where}: ${shown(violation.message)}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(`${label}:\n  ${problems.join("\n  ")}`);
  }
}

/** An engine for one vendored profile (`<root>vendor/…`), its SPARQL constraints left out. */
export async function loadProfileEngine(
  root: string,
  profile: ProfileName,
): Promise<ShapeEngine> {
  const quads = await Promise.all(
    PROFILES[profile].map(async (path) =>
      parseTurtle(await readFile(join(root, "vendor", path), "utf8"), `${SITE_VENDOR}${path}`),
    ),
  );
  return createEngine(new Store(coreOnly(quads.flat())));
}

/** The reference data a profile check loads next to a document, from ns/vocab/. */
export async function loadReferenceData(): Promise<Quad[]> {
  return (await Promise.all(REFERENCE_DATA.map((path) => readSiteQuads(`${VOCAB_BASE}${path}`)))).flat();
}

/**
 * Check a whole document against a profile, with the reference data in
 * the data graph. Throws one Error listing every violation about a
 * subject of the document, `label` first; results about the reference
 * data itself are its own test's business. Warnings (a profile's
 * recommendations) fail only with `minimum: "warning"`, which Solid
 * Memo's own concept schemes are held to; infos never fail.
 */
export async function validateProfile(
  label: string,
  quads: readonly Quad[],
  engine: ShapeEngine,
  reference: readonly Quad[],
  minimum: "violation" | "warning" = "violation",
): Promise<void> {
  const failing = minimum === "warning" ? ["violation", "warning"] : ["violation"];
  const subjects = new Set(quads.map((q) => q.subject.value));
  const problems = (await engine.validate(new Store([...quads, ...reference])))
    .filter((violation) => failing.includes(violation.severity))
    .filter((violation) => subjects.has(violation.focusNode))
    .map((violation) => {
      const where = violation.path === undefined ? "" : ` (${violation.path})`;
      return `<${violation.focusNode}>${where}: ${shown(violation.message)}`;
    });
  if (problems.length > 0) {
    throw new Error(`${label}:\n  ${problems.join("\n  ")}`);
  }
}
