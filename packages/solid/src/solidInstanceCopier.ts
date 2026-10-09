import {
  createContainerAt,
  createSolidDataset,
  fromRdfJsDataset,
  getFile,
  getSolidDataset,
  getThingAll,
  getUrlAll,
  overwriteFile,
  setThing,
  toRdfJsDataset,
  type SolidDataset,
} from "@inrupt/solid-client";
import type { ContainerMove, InstanceCopier } from "@solid-memo/application/ports";
import { rebaseIri } from "@solid-memo/domain/instanceUpdate";
import { movedIri } from "./movedDataset";
import { deleteContainerRecursively, listContainerTree } from "./containers";
import { getSolidDatasetOrNull, PreconditionFailedError, saveDataset } from "./datasets";
import { AppError } from "@solid-memo/domain/appError";

type Fetch = typeof globalThis.fetch;

/**
 * What a copy was made from, for asking the pod later whether the
 * resource is still that: the request's Accept (an ETag is a property of
 * one representation), and the response's ETag, else its Last-Modified,
 * else a hash of its body.
 */
interface Version {
  accept?: string;
  etag?: string;
  lastModified?: string;
  sha256?: string;
}

async function sha256(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A fetch that remembers the version of the response it last got. */
function versionRecorder(fetch: Fetch) {
  let version: Version = {};
  return {
    fetch: (async (input, init) => {
      const response = await fetch(input, init);
      const accept = new Headers(init?.headers).get("Accept") ?? undefined;
      const etag = response.headers.get("ETag") ?? undefined;
      const lastModified = response.headers.get("Last-Modified") ?? undefined;
      version = { accept, etag, lastModified };
      if (etag === undefined && lastModified === undefined) {
        version.sha256 = await sha256(await response.clone().arrayBuffer());
      }
      return response;
    }) as Fetch,
    version: () => JSON.stringify(version),
  };
}

/** The fetch, with `If-None-Match: *` on its writes: a copy never overwrites anything. */
function createOnly(fetch: Fetch): Fetch {
  return (input, init) => {
    if ((init?.method ?? "GET").toUpperCase() !== "PUT") return fetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set("If-None-Match", "*");
    return fetch(input, { ...init, headers });
  };
}

/** An IRI moved: renamed, under a container (a URL ending in "/"), or of one document and its fragments. */
function moveIri(iri: string, move: ContainerMove): string {
  if (move.renames !== undefined && Object.hasOwn(move.renames, iri)) return move.renames[iri]!;
  return move.from.endsWith("/") ? rebaseIri(iri, move.from, move.to) : movedIri(iri, move.from, move.to);
}

/** The URL a `Link` header gives for `rel`, resolved against the resource; null when none. */
export function linkedUrl(link: string | null, rel: string, resourceUrl: string): string | null {
  for (const match of (link ?? "").matchAll(/<([^>]*)>\s*;([^,]*)/g)) {
    const rels = /rel\s*=\s*"?([^";]*)"?/.exec(match[2])?.[1].split(/\s+/) ?? [];
    if (rels.includes(rel)) return new URL(match[1], resourceUrl).href;
  }
  return null;
}

type LoadMapIris = () => Promise<{ mapIris: typeof import("@solid-memo/shacl/engine").mapIris }>;

/** A dataset with every IRI moved, and those of a document moved besides (an access control document's own). */
async function rebasedDataset(
  dataset: Parameters<typeof toRdfJsDataset>[0],
  move: ContainerMove,
  loadEngine: LoadMapIris,
  also?: ContainerMove,
) {
  const { mapIris } = await loadEngine();
  const map = (iri: string) => moveIri(iri, move);
  return fromRdfJsDataset(
    mapIris(toRdfJsDataset(dataset), also === undefined ? map : (iri) => movedIri(map(iri), also.from, also.to)),
  );
}

/** The URL the pod says a resource's access control document is at (`Link: rel="acl"`); null when it says none. */
async function aclUrlOf(url: string, fetch: Fetch): Promise<string | null> {
  return linkedUrl((await fetch(url, { method: "HEAD" })).headers.get("Link"), "acl", url);
}

const ACL_NS = "http://www.w3.org/ns/auth/acl#";
const ACL_AUTHORIZATION = `${ACL_NS}Authorization`;
const ACL_ACCESS_TO = `${ACL_NS}accessTo`;
const ACL_DEFAULT = `${ACL_NS}default`;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

/** The folder a resource is in; null for the root. */
function folderOf(url: string): string | null {
  const parent = new URL(url.endsWith("/") ? ".." : ".", url).href;
  return parent === url ? null : parent;
}

/**
 * The rules a folder's own access control gives what is inside it
 * (`acl:default`), each now of `resource` alone (`acl:accessTo`), at
 * `targetAcl`: what the resource would inherit there, as its own.
 */
function inheritedAs(acl: SolidDataset, resource: string, targetAcl: string): SolidDataset {
  let rules = createSolidDataset();
  const inherited = getThingAll(acl).filter(
    (thing) => getUrlAll(thing, RDF_TYPE).includes(ACL_AUTHORIZATION) && getUrlAll(thing, ACL_DEFAULT).length > 0,
  );
  for (const [index, thing] of inherited.entries()) {
    const { [ACL_ACCESS_TO]: _accessTo, [ACL_DEFAULT]: _default, ...predicates } = thing.predicates;
    rules = setThing(rules, {
      type: "Subject",
      url: `${targetAcl}#inherited-${index + 1}`,
      predicates: { ...predicates, [ACL_ACCESS_TO]: { namedNodes: [resource] } },
    });
  }
  return rules;
}

/**
 * Give `to` the access `from` has, as an access control of its own:
 * `from`'s own, its IRIs moved to `to`; or, when it inherits, the
 * rules of the nearest folder above it with an access control of its own
 * that its contents inherit (WAC `acl:default`), each now of `to` alone.
 * A copy kept anywhere is then exactly as open as the resource. False
 * when the pod gives `from` no access control (`Link: rel="acl"`); a
 * folder's access control that cannot be read stops it.
 */
export async function copyEffectiveAccessControl(
  deps: { fetch: Fetch; loadEngine: LoadMapIris },
  from: string,
  to: string,
): Promise<boolean> {
  const sourceAcl = await aclUrlOf(from, deps.fetch);
  if (sourceAcl === null) return false;
  const own = await getSolidDatasetOrNull(sourceAcl, deps.fetch);
  if (own !== null) return placeAccessControl(deps, own, { from: sourceAcl, to }, { from, to });
  for (let folder = folderOf(from); folder !== null; folder = folderOf(folder)) {
    const folderAcl = await aclUrlOf(folder, deps.fetch);
    const acl = folderAcl === null ? null : await getSolidDatasetOrNull(folderAcl, deps.fetch);
    if (acl !== null) return placeInherited(deps.fetch, acl, to);
  }
  return false;
}

/** Write the rules a folder's access control gives its contents as `to`'s own access control; true. */
async function placeInherited(fetch: Fetch, acl: SolidDataset, to: string): Promise<true> {
  const targetAcl = await aclUrlOf(to, fetch);
  if (targetAcl === null) throw new AppError("accessControlUnknown", { url: to });
  await saveDataset(targetAcl, inheritedAs(acl, to, targetAcl), fetch);
  return true;
}

/** Write an access control document's rules, moved, as the access control of `acls.to`'s resource; true. */
async function placeAccessControl(
  { fetch, loadEngine }: { fetch: Fetch; loadEngine: LoadMapIris },
  acl: Parameters<typeof toRdfJsDataset>[0],
  acls: { from: string; to: string },
  move: ContainerMove,
): Promise<true> {
  const targetAcl = await aclUrlOf(acls.to, fetch);
  if (targetAcl === null) throw new AppError("accessControlUnknown", { url: acls.to });
  // A document's rules name their own document too, which moves with them.
  const rebased = await rebasedDataset(acl, move, loadEngine, { from: acls.from, to: targetAcl });
  await saveDataset(targetAcl, rebased, fetch);
  return true;
}

/**
 * The InstanceCopier over a Solid pod: documents copied with every IRI
 * under the old container moved under the new one (a deck's cards
 * document, the catalogue node, the access rules' targets), other files
 * byte for byte, and each resource's own access control copied the same
 * way. The engine module (lazy, like the validator's) does the moving.
 */
export function createSolidInstanceCopier({
  fetch,
  loadEngine = () => import("@solid-memo/shacl/engine"),
}: {
  fetch: Fetch;
  loadEngine?: LoadMapIris;
}): InstanceCopier {
  function head(url: string): Promise<Response> {
    return fetch(url, { method: "HEAD" });
  }

  return {
    listResources: (containerUrl) => listContainerTree(containerUrl, fetch),

    async ensureAbsent(url) {
      const response = await head(url);
      if (response.status === 404) return;
      throw response.ok
        ? new AppError("alreadyExists", { url })
        : new AppError("cannotCheck", { url, status: response.status });
    },

    async createContainer(url) {
      await createContainerAt(url, { fetch });
    },

    async copyResource(from, to, move) {
      const source = versionRecorder(fetch);
      if (from.endsWith("/")) {
        // A container's version: what it lists, which the update compares on its own too.
        await source.fetch(from, { method: "HEAD", headers: { Accept: "text/turtle" } });
        await createContainerAt(to, { fetch });
        return source.version();
      }
      const contentType = (await head(from)).headers.get("Content-Type") ?? "";
      if (contentType.startsWith("text/turtle")) {
        const dataset = await getSolidDataset(from, { fetch: source.fetch });
        await saveDataset(to, await rebasedDataset(dataset, move, loadEngine), fetch);
        return source.version();
      }
      const file = await getFile(from, { fetch: source.fetch });
      try {
        await overwriteFile(to, file, { contentType: contentType || file.type, fetch: createOnly(fetch) });
      } catch (error) {
        if ((error as { statusCode?: number }).statusCode === 412) throw new PreconditionFailedError(to, "absent");
        throw error;
      }
      return source.version();
    },

    async isUnchanged(url, version) {
      const { accept, etag, lastModified, sha256: hash } = JSON.parse(version) as Version;
      const headers = new Headers(accept === undefined ? {} : { Accept: accept });
      if (etag !== undefined) headers.set("If-None-Match", etag);
      else if (lastModified !== undefined) headers.set("If-Modified-Since", lastModified);
      else {
        const response = await fetch(url, { headers });
        return response.ok && (await sha256(await response.arrayBuffer())) === hash;
      }
      const response = await fetch(url, { method: "HEAD", headers });
      if (response.status === 304) return true;
      // A pod that ignores the condition still says what it has now.
      if (!response.ok) return false;
      return etag !== undefined
        ? response.headers.get("ETag") === etag
        : response.headers.get("Last-Modified") === lastModified;
    },

    async mentions(url, text) {
      const response = await fetch(url);
      if (!response.ok) throw new AppError("cannotCheck", { url, status: response.status });
      return (await response.text()).includes(text);
    },

    deleteRecursively: (url) => deleteContainerRecursively(url, fetch),
  };
}
