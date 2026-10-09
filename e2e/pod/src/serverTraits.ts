/**
 * What a server does that the tests depend on, asked of it rather than
 * assumed (docs/testing.md).
 *
 * A test may skip on what these find only where the server does something
 * the Solid Protocol allows and the app copes with: no ETag on a read,
 * If-Match or If-None-Match: * ignored, an ETag an edit in the same second
 * keeps. What the app needs and has no way around (a PATCH it can send, an
 * ACL it can write, every insert of several at once kept) is never a
 * reason to skip: a server without it fails the tests, which is what they
 * are for. A probe that cannot tell throws, so the tests fail rather than
 * skip; probes write under probe-<uuid> documents of their own.
 */

/** The reason a test is skipped on a server whose ETag outlives an edit. */
export const ETAG_OUTLIVES_EDITS =
  "this server's ETag does not change on an edit made in the same second (Community Solid Server 6 stamps whole seconds), so a changed document can look unchanged";

const PIM_STORAGE = "http://www.w3.org/ns/pim/space#Storage";

/** A new Turtle document under the server's root, for a probe. */
async function probeDocument(server: string): Promise<string> {
  const url = new URL(`probe-${crypto.randomUUID()}.ttl`, server).href;
  const response = await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body: `<#a> <#b> "0" .` });
  if (!response.ok) throw new Error(`Probing ${server}: PUT ${url} answered ${response.status}.`);
  return url;
}

/** A SPARQL Update PATCH, as the app sends. */
async function sparqlPatch(url: string, body: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, { method: "PATCH", headers: { "content-type": "application/sparql-update", ...headers }, body });
}

/** Whether the server gives a read's ETag: only then can a version be kept. */
export async function versioned(url: string): Promise<boolean> {
  return (await fetch(url)).headers.get("ETag") !== null;
}

/**
 * Whether the server's ETag changes on every edit, however soon after a
 * read: a document is written, then edited at once several times, read
 * before and after each edit. Community Solid Server 6 builds its ETag
 * from the modification time in whole seconds, so an edit in the same
 * second keeps it; one edit may happen to cross into the next second,
 * five in a row cannot. False too for a server that gives no ETag. Ask
 * once per server and share the answer, so every test agrees.
 */
export async function etagMarksEveryEdit(server: string): Promise<boolean> {
  const url = await probeDocument(server);
  for (let edit = 1; edit <= 5; edit++) {
    const before = (await fetch(url)).headers.get("etag");
    const patched = await sparqlPatch(url, `INSERT DATA { <#e${edit}> <#n> "${edit}" . };`);
    if (!patched.ok) throw new Error(`Probing whether an edit changes the ETag: PATCH ${url} answered ${patched.status}.`);
    const after = (await fetch(url)).headers.get("etag");
    if (before === null || before === after) return false;
  }
  return true;
}

/** What a server does with the preconditions Solid Memo sends. */
export interface Preconditions {
  /** It gives a strong ETag, and refuses (412) a PATCH whose If-Match names another version. */
  edits: boolean;
  /** It refuses (412) a PUT with If-None-Match: * where a document is. */
  creations: boolean;
}

export async function preconditionsOf(server: string): Promise<Preconditions> {
  const url = new URL(`probe-${crypto.randomUUID()}.ttl`, server).href;
  const put = () =>
    fetch(url, { method: "PUT", headers: { "content-type": "text/turtle", "if-none-match": "*" }, body: `<#a> <#b> "c" .` });
  await put();
  const creations = (await put()).status === 412;
  const etag = (await fetch(url)).headers.get("etag");
  if (etag === null || etag.startsWith("W/")) return { edits: false, creations };
  const response = await sparqlPatch(url, `INSERT DATA { <#d> <#e> "f" . };`, { "if-match": '"another-version"' });
  if (response.status !== 412 && !response.ok) {
    throw new Error(`Probing whether If-Match is enforced: PATCH ${url} answered ${response.status}.`);
  }
  return { edits: response.status === 412, creations };
}

/** The PATCH formats a server applies, each tried: SPARQL Update (what the app sends) and N3 Patch (what the Solid Protocol asks of every server). */
export async function patchFormatsOf(server: string): Promise<{ sparqlUpdate: boolean; n3: boolean }> {
  const url = await probeDocument(server);
  const sparqlUpdate = (await sparqlPatch(url, `INSERT DATA { <#s> <#p> "sparql" . };`)).ok;
  const n3 = (await fetch(url, { method: "PATCH", headers: { "content-type": "text/n3" }, body: n3Insert(`<#s> <#p> "n3" .`) })).ok;
  return { sparqlUpdate, n3 };
}

const n3Insert = (triples: string) =>
  `@prefix solid: <http://www.w3.org/ns/solid/terms#>. _:p a solid:InsertDeletePatch; solid:inserts { ${triples} }.`;

/**
 * Adds a triple to a document as another app would, in whatever way the
 * server takes: an N3 Patch or a SPARQL Update, as its Accept-Patch says,
 * else the document read and written whole. For tests that need a change
 * made behind the app's back; how is not what they test.
 */
export async function changeElsewhere(url: string, triple: string): Promise<void> {
  const read = await fetch(url, { headers: { accept: "text/turtle" } });
  const accepted = read.headers.get("accept-patch") ?? "";
  const response = accepted.includes("text/n3")
    ? await fetch(url, { method: "PATCH", headers: { "content-type": "text/n3" }, body: n3Insert(triple) })
    : accepted.includes("application/sparql-update")
      ? await sparqlPatch(url, `INSERT DATA { ${triple} };`)
      : await fetch(url, { method: "PUT", headers: { "content-type": "text/turtle" }, body: `${await read.text()}\n${triple}\n` });
  if (!response.ok) throw new Error(`Changing ${url} as another app: ${response.status}.`);
}

/** The ACL document of a resource, where its Link rel="acl" says: the Solid Protocol leaves the name to the server. */
export async function aclOf(url: string): Promise<string> {
  const link = /<([^>]+)>;\s*rel="acl"/.exec((await fetch(url, { method: "HEAD" })).headers.get("link") ?? "")?.[1];
  if (link === undefined) throw new Error(`${url} names no ACL document (Link rel="acl").`);
  return new URL(link, url).href;
}

/** The storage a resource is in: the nearest container up from it that says it is a pim:Storage, else its origin's root. */
export async function storageOf(url: string): Promise<string> {
  for (let container = new URL("./", url); ; container = new URL("../", container)) {
    const link = (await fetch(container, { method: "HEAD" })).headers.get("link") ?? "";
    if (new RegExp(`<${PIM_STORAGE}>;\\s*rel="type"`).test(link) || container.pathname === "/") return container.href;
  }
}

/** All of the above, for the tests that pin what each server the tests start does (serverTraits.integration.test.ts). */
export async function traitsOf(server: string) {
  return {
    etag: await versioned(await probeDocument(server)),
    etagEveryEdit: await etagMarksEveryEdit(server),
    ...(await preconditionsOf(server)),
    ...(await patchFormatsOf(server)),
  };
}
