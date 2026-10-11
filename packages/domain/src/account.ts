import type { WebIdDocument } from "./webIdDocument";

/**
 * The user's Solid account as discovered after login. Everything beyond
 * the WebID comes from the WebID profile and may be absent.
 */
export interface SolidAccount {
  webId: string;
  /** The profile's `foaf:name`, shown in place of the WebID when present. */
  name?: string;
  /** Root of the user's Pod (first storage the profile advertises). */
  podUrl?: string;
  /** Identity provider the profile declares via solid:oidcIssuer. */
  oidcIssuer?: string;
}

const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";

/**
 * The name the WebID profile gives its own subject: the first non-blank
 * `foaf:name` literal, in any language. Undefined when the profile has
 * none, so the WebID itself is shown instead.
 */
export function profileNameOf(document: WebIdDocument, webId: string): string | undefined {
  const subject = document.subjects.find((s) => s.url === webId);
  const names = subject?.properties.find((p) => p.predicate === FOAF_NAME);
  for (const value of names?.values ?? []) {
    if (value.type !== "literal" && value.type !== "langString") continue;
    const name = value.value.trim();
    if (name !== "") return name;
  }
  return undefined;
}
