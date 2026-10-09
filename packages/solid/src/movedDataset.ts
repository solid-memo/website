import { fromRdfJsDataset, toRdfJsDataset, type SolidDataset } from "@inrupt/solid-client";

/** The engine module's IRI mapper, loaded when first needed (it is large, like the validator). */
export type LoadEngine = () => Promise<{ mapIris: typeof import("@solid-memo/shacl/engine").mapIris }>;

export const loadEngine: LoadEngine = () => import("@solid-memo/shacl/engine");

/** The document's IRI or one of its fragments, moved to another document; any other IRI as it is. */
export function movedIri(iri: string, from: string, to: string): string {
  if (iri === from) return to;
  return iri.startsWith(`${from}#`) ? `${to}${iri.slice(from.length)}` : iri;
}

/** One document moved: its IRI and its fragments' from `from` to `to`. */
export interface DocumentMove {
  from: string;
  to: string;
}

/**
 * A document's dataset as a new dataset for another document: every IRI
 * of each moved document (its own first, then any it links to that moves
 * with it) taken to its new one, all else as it is. A new dataset is
 * saved as a creation (If-None-Match: *).
 */
export async function movedDataset(
  dataset: SolidDataset,
  moves: readonly DocumentMove[],
  load: LoadEngine = loadEngine,
): Promise<SolidDataset> {
  const { mapIris } = await load();
  return fromRdfJsDataset(
    mapIris(toRdfJsDataset(dataset), (iri) => {
      const move = moves.find(({ from }) => iri === from || iri.startsWith(`${from}#`));
      return move === undefined ? iri : movedIri(iri, move.from, move.to);
    }),
  );
}
