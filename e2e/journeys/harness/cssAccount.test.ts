import { describe, expect, it } from "vitest";
import type { APIRequestContext } from "@playwright/test";
import { accountControls, accountToken, createAccount, createdClient, createdPod, podName } from "./cssAccount.ts";

const SERVER = "https://127.0.0.1:4000/";
const CONTROLS = {
  controls: {
    password: { create: `${SERVER}.account/account/a/login/password/` },
    account: { pod: `${SERVER}.account/account/a/pod/`, clientCredentials: `${SERVER}.account/account/a/client-credentials/` },
  },
};

describe("the account API's answers", () => {
  it("give the account token", () => {
    expect(accountToken({ authorization: "t-1", controls: {} })).toBe("t-1");
    expect(() => accountToken({})).toThrow(/no token/);
    expect(() => accountToken(null)).toThrow(/no token/);
  });

  it("give the controls to add a login, a pod and client credentials", () => {
    expect(accountControls(CONTROLS)).toEqual(CONTROLS.controls);
    expect(() => accountControls({ controls: { password: {} } })).toThrow(/no controls/);
  });

  it("give the pod and WebID made", () => {
    expect(createdPod({ pod: `${SERVER}j/`, webId: `${SERVER}j/profile/card#me` })).toEqual({ pod: `${SERVER}j/`, webId: `${SERVER}j/profile/card#me` });
    expect(() => createdPod(undefined)).toThrow(/no pod/);
  });

  it("give the client credentials made", () => {
    expect(createdClient({ id: "c", secret: "s", resource: "r" })).toEqual({ id: "c", secret: "s" });
    expect(() => createdClient({ id: "c" })).toThrow(/no id and secret/);
  });
});

describe("podName", () => {
  it("is j- and eight hex digits of the id", () => {
    expect(podName("0A1B2C3D-4e5f")).toBe("j-0a1b2c3d");
  });

  it("refuses an id with too few", () => {
    expect(() => podName("xyz")).toThrow(/Too little/);
  });
});

describe("createAccount", () => {
  it("makes the account, its login, its pod and its client credentials, in that order", async () => {
    const calls: string[] = [];
    const answer = (body: unknown, ok = true) => ({ ok: () => ok, status: () => (ok ? 200 : 400), text: async () => "refused", json: async () => body });
    const api = {
      post: async (url: string, { data }: { data: unknown }) => {
        calls.push(`POST ${url} ${JSON.stringify(data)}`);
        if (url.endsWith(".account/account/")) return answer({ authorization: "tok" });
        if (url.endsWith("/pod/")) return answer({ pod: `${SERVER}j-12345678/`, webId: `${SERVER}j-12345678/profile/card#me` });
        if (url.endsWith("/client-credentials/")) return answer({ id: "cid", secret: "sec" });
        return answer({});
      },
      get: async (url: string, { headers }: { headers: Record<string, string> }) => {
        calls.push(`GET ${url} ${headers.authorization}`);
        return answer(CONTROLS);
      },
    } as unknown as APIRequestContext;
    const account = await createAccount(api, SERVER, "12345678");
    expect(account).toEqual({
      email: "j-12345678@journeys.example",
      password: "pw-12345678",
      webId: `${SERVER}j-12345678/profile/card#me`,
      pod: `${SERVER}j-12345678/`,
      client: { id: "cid", secret: "sec" },
    });
    expect(calls).toEqual([
      `POST ${SERVER}.account/account/ {}`,
      `GET ${SERVER}.account/ CSS-Account-Token tok`,
      `POST ${CONTROLS.controls.password.create} {"email":"j-12345678@journeys.example","password":"pw-12345678"}`,
      `POST ${CONTROLS.controls.account.pod} {"name":"j-12345678"}`,
      `POST ${CONTROLS.controls.account.clientCredentials} {"name":"j-12345678-dump","webId":"${SERVER}j-12345678/profile/card#me"}`,
    ]);
  });

  it("says which request the server refused", async () => {
    const api = { post: async () => ({ ok: () => false, status: () => 500, text: async () => "boom" }) } as unknown as APIRequestContext;
    await expect(createAccount(api, SERVER, "12345678")).rejects.toThrow("Creating the account: 500 boom");
  });
});
