import type { APIRequestContext } from "@playwright/test";

/**
 * A fresh account on the Community Solid Server, with a password login and
 * a pod, made through its JSON account API (version 0.5, CSS 7): what a
 * journey logs in with. Each journey gets its own, so they can run side by
 * side.
 */
export interface CssAccount {
  email: string;
  password: string;
  webId: string;
  /** The pod's root, ending in a slash. */
  pod: string;
  /** Client credentials for the WebID, which read the pod without the browser (podDump.ts). */
  client: { id: string; secret: string };
}

/** What /.account/ answers with: the links to act on the account. */
export interface AccountControls {
  password: { create: string };
  account: { pod: string; clientCredentials: string };
}

/** The account token in the answer to creating an account. */
export function accountToken(body: unknown): string {
  const token = (body as { authorization?: unknown } | null)?.authorization;
  if (typeof token !== "string" || token === "") throw new Error(`Creating the account answered no token: ${JSON.stringify(body)}`);
  return token;
}

/** The controls for a logged-in account, from /.account/. */
export function accountControls(body: unknown): AccountControls {
  type Controls = { password?: { create?: unknown }; account?: { pod?: unknown; clientCredentials?: unknown } };
  const controls = (body as { controls?: Controls } | null)?.controls;
  const create = controls?.password?.create;
  const pod = controls?.account?.pod;
  const clientCredentials = controls?.account?.clientCredentials;
  if (typeof create !== "string" || typeof pod !== "string" || typeof clientCredentials !== "string") {
    throw new Error(`The account API answered no controls to create a login, a pod and client credentials: ${JSON.stringify(body)}`);
  }
  return { password: { create }, account: { pod, clientCredentials } };
}

/** The pod and WebID in the answer to creating a pod. */
export function createdPod(body: unknown): { pod: string; webId: string } {
  const { pod, webId } = (body ?? {}) as { pod?: unknown; webId?: unknown };
  if (typeof pod !== "string" || typeof webId !== "string") throw new Error(`Creating the pod answered no pod and WebID: ${JSON.stringify(body)}`);
  return { pod, webId };
}

/** The id and secret in the answer to creating client credentials. */
export function createdClient(body: unknown): { id: string; secret: string } {
  const { id, secret } = (body ?? {}) as { id?: unknown; secret?: unknown };
  if (typeof id !== "string" || typeof secret !== "string") throw new Error(`Creating client credentials answered no id and secret: ${JSON.stringify(body)}`);
  return { id, secret };
}

/** A pod name unique to the journey and its run: "j-<8 hex>". */
export function podName(id: string): string {
  const name = `j-${id.replace(/[^0-9a-f]/gi, "").slice(0, 8).toLowerCase()}`;
  if (name.length !== 10) throw new Error(`Too little to name a pod by: ${id}`);
  return name;
}

/**
 * The account, made with `api` (which must accept the server's
 * certificate, and must not be the browser's: its cookie would log the
 * browser in, skipping the login a journey goes through).
 */
export async function createAccount(api: APIRequestContext, server: string, id: string): Promise<CssAccount> {
  const name = podName(id);
  const email = `${name}@journeys.example`;
  const password = `pw-${id}`;
  const json = async (response: Awaited<ReturnType<APIRequestContext["get"]>>, what: string) => {
    if (!response.ok()) throw new Error(`${what}: ${response.status()} ${await response.text()}`);
    return response.json() as Promise<unknown>;
  };
  const token = accountToken(await json(await api.post(new URL(".account/account/", server).href, { data: {} }), "Creating the account"));
  const headers = { authorization: `CSS-Account-Token ${token}` };
  const controls = accountControls(await json(await api.get(new URL(".account/", server).href, { headers }), "Reading the account"));
  await json(await api.post(controls.password.create, { headers, data: { email, password } }), "Adding the password login");
  const { pod, webId } = createdPod(await json(await api.post(controls.account.pod, { headers, data: { name } }), "Creating the pod"));
  const client = createdClient(
    await json(await api.post(controls.account.clientCredentials, { headers, data: { name: `${name}-dump`, webId } }), "Creating client credentials"),
  );
  return { email, password, webId, pod, client };
}
