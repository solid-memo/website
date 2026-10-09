/** The document's IRI or one of its fragments, moved to another document; any other IRI as it is. */
export function movedIri(iri: string, from: string, to: string): string {
  if (iri === from) return to;
  return iri.startsWith(`${from}#`) ? `${to}${iri.slice(from.length)}` : iri;
}
