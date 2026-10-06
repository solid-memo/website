import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkEveryConceptInAScheme, parseConceptSchemes, renderConcepts } from "./concepts.ts";
import { readTurtleTree, type TurtleFile } from "@solid-memo/turtle/rdf";
import { VOCAB_BASE } from "../src/ns.ts";
import { NS_ROOT } from "./root.ts";
import { parseShapes, renderDescriptors, renderDomainTypes } from "./shapes.ts";
import { parseVocab, renderVocabConstants, VOCAB_IRI } from "./vocab.ts";

/**
 * `npm run generate`: render the TypeScript that the vocabulary and the
 * shapes (the repository's ns/) determine, and write it; `npm run
 * generate:check` renders and fails on any difference from what is
 * committed. The outputs are data only (constants, interfaces), so drift
 * is caught by `tsc` and the tests too — the check just names the file.
 */

export const OUTPUTS = {
  vocab: "src/vocab.generated.ts",
  types: "src/types.generated.ts",
  descriptors: "src/descriptors.generated.ts",
  concepts: "src/concepts.generated.ts",
} as const;

/** The documents holding Solid Memo's concept schemes, under ns/, with their base IRIs. */
const CONCEPT_SOURCES = [
  { path: "vocab/v1.ttl", baseIri: VOCAB_IRI },
  { path: "vocab/topics.ttl", baseIri: `${VOCAB_BASE}topics.ttl` },
] as const;

export interface GenerateIo {
  /** A file under the package, such as a committed output. */
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  /** A file under ns/, such as the vocabulary. */
  readNs(path: string): Promise<string>;
  /** Every Turtle file in a folder under ns/. */
  readTurtleTree(dir: string): Promise<TurtleFile[]>;
  log(message: string): void;
}

export function defaultIo(root: string, ns = NS_ROOT): GenerateIo {
  return {
    readFile: (path) => readFile(join(root, path), "utf8"),
    writeFile: (path, text) => writeFile(join(root, path), text),
    readNs: (path) => readFile(join(ns, path), "utf8"),
    readTurtleTree: (dir) => readTurtleTree(join(ns, dir)),
    log: (message) => console.log(message),
  };
}

/** Every output path with its rendered text. */
export async function render(io: GenerateIo): Promise<Record<string, string>> {
  const vocab = parseVocab(await io.readNs("vocab/v1.ttl"));
  const shapes = parseShapes(await io.readTurtleTree("shapes"));
  const conceptDocuments = await Promise.all(
    CONCEPT_SOURCES.map(async ({ path, baseIri }) => ({
      turtle: await io.readNs(path),
      baseIri,
    })),
  );
  const schemes = conceptDocuments.flatMap(({ turtle, baseIri }) =>
    parseConceptSchemes(turtle, baseIri),
  );
  checkEveryConceptInAScheme(conceptDocuments, schemes);
  return {
    [OUTPUTS.vocab]: renderVocabConstants(vocab),
    [OUTPUTS.types]: renderDomainTypes(shapes),
    [OUTPUTS.descriptors]: renderDescriptors(shapes),
    [OUTPUTS.concepts]: renderConcepts(
      CONCEPT_SOURCES.map((source) => `ns/${source.path}`),
      schemes,
    ),
  };
}

/** Exit code: 0 when written (or, with --check, up to date), 1 on drift. */
export async function main(argv: readonly string[], io: GenerateIo): Promise<number> {
  const outputs = await render(io);
  if (!argv.includes("--check")) {
    for (const [path, text] of Object.entries(outputs)) {
      await io.writeFile(path, text);
      io.log(`wrote ${path}`);
    }
    return 0;
  }
  let drifted = 0;
  for (const [path, text] of Object.entries(outputs)) {
    const committed = await io.readFile(path).catch(() => "");
    if (committed !== text) {
      io.log(`${path} is out of date: run \`npm run generate\`.`);
      drifted += 1;
    }
  }
  return drifted === 0 ? 0 : 1;
}

/** The script entry: `node -e "import('./tooling/generate.ts').then((m) => m.run())"`. */
export async function run(
  process: { argv: readonly string[]; cwd(): string; exitCode?: number },
): Promise<void> {
  process.exitCode = await main(process.argv, defaultIo(process.cwd()));
}
