import type { APIRequestContext } from "@playwright/test";
import type { CssAccount } from "./cssAccount.ts";

/**
 * Everything in a journey's pod, as Turtle: what the app had written when
 * the journey failed, attached to its report. Read with the account's
 * client credentials (a Bearer token from the server's token endpoint),
 * not through the browser, whose page may be the thing that broke.
 */

const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";
/** Enough for any journey's pod; more is cut off, and says so. */
export const MAX_DOCUMENTS = 1000;
/** Each request's, so a server that hangs does not hold up the report for long. */
const TIMEOUT_MS = 5_000;

/** The resources a container lists, from its JSON-LD (expanded or not). */
export function containedIn(jsonld: unknown, container: string): string[] {
  const nodes = Array.isArray(jsonld) ? jsonld : [jsonld];
  const found = new Set<string>();
  for (const node of nodes as Record<string, unknown>[]) {
    if (node === null || typeof node !== "object") continue;
    const id = node["@id"];
    if (id !== undefined && new URL(String(id), container).href !== container) continue;
    const contains = node[LDP_CONTAINS] ?? node["contains"] ?? node["ldp:contains"];
    for (const item of Array.isArray(contains) ? contains : contains === undefined ? [] : [contains]) {
      const ref = typeof item === "string" ? item : (item as { "@id"?: unknown })["@id"];
      if (typeof ref === "string") found.add(new URL(ref, container).href);
    }
  }
  return [...found].sort();
}

/** A token for the account's WebID, by its client credentials. */
async function bearer(api: APIRequestContext, server: string, account: CssAccount): Promise<string> {
  const basic = Buffer.from(`${encodeURIComponent(account.client.id)}:${encodeURIComponent(account.client.secret)}`).toString("base64");
  const response = await api.post(new URL(".oidc/token", server).href, {
    headers: { authorization: `Basic ${basic}` },
    form: { grant_type: "client_credentials", scope: "webid" },
  });
  if (!response.ok()) throw new Error(`The token endpoint refused the client credentials: ${response.status()} ${await response.text()}`);
  return ((await response.json()) as { access_token: string }).access_token;
}

/** The pod's documents, each under a `# <url>` line, containers first listing what they hold. */
export async function dumpPod(api: APIRequestContext, server: string, account: CssAccount): Promise<string> {
  const headers = { authorization: `Bearer ${await bearer(api, server, account)}` };
  const out: string[] = [];
  const queue = [account.pod];
  const seen = new Set(queue);
  while (queue.length > 0) {
    if (seen.size > MAX_DOCUMENTS) {
      out.push(`# … cut off after ${MAX_DOCUMENTS} documents`);
      break;
    }
    const url = queue.shift()!;
    // One document that cannot be read is said so; the rest are still dumped.
    try {
      if (url.endsWith("/")) {
        const listing = await api.get(url, { headers: { ...headers, accept: "application/ld+json" }, timeout: TIMEOUT_MS });
        if (listing.ok()) {
          for (const child of containedIn(await listing.json(), url)) {
            if (!seen.has(child)) {
              seen.add(child);
              queue.push(child);
            }
          }
        }
      }
      const response = await api.get(url, { headers: { ...headers, accept: "text/turtle" }, timeout: TIMEOUT_MS });
      const type = response.headers()["content-type"] ?? "";
      const body = /turtle|text\/|json/.test(type) ? await response.text() : `(${type}, ${(await response.body()).length} bytes)`;
      out.push(`# ${url} — ${response.status()} ${type}`, body.trimEnd(), "");
    } catch (error) {
      out.push(`# ${url} — could not be read: ${(error as Error).message.split("\n")[0]}`, "");
    }
  }
  return out.join("\n");
}
