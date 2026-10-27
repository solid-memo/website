// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import "fake-indexeddb/auto";
import { generateKeyPair } from "oauth4webapi";
import { describe, expect, it, vi } from "vitest";
import {
  clearSession,
  loadRegistration,
  loadSession,
  saveRegistration,
  saveSession,
} from "./oidcStore";

describe("the sign-in store", () => {
  it("keeps the session, its key pair unexportable, until it is cleared", async () => {
    await expect(loadSession()).resolves.toBeUndefined();
    const keys = await generateKeyPair("ES256");
    await saveSession({
      issuer: "https://idp.example/",
      client: { client_id: "c" },
      redirectUrl: "https://memo.example/",
      keys,
      webId: "https://alice.example/profile/card#me",
      refreshToken: "r",
    });
    const stored = await loadSession();
    expect(stored).toMatchObject({ issuer: "https://idp.example/", refreshToken: "r" });
    expect(stored?.keys.privateKey.extractable).toBe(false);
    const data = new TextEncoder().encode("signed");
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      stored?.keys.privateKey as CryptoKey,
      data,
    );
    await expect(
      crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, keys.publicKey, signature, data),
    ).resolves.toBe(true);
    await clearSession();
    await expect(loadSession()).resolves.toBeUndefined();
  });

  it("keeps registrations by key, past a cleared session", async () => {
    await saveRegistration("https://idp.example/ https://memo.example/", { client_id: "c" });
    await clearSession();
    await expect(loadRegistration("https://idp.example/ https://memo.example/")).resolves.toEqual({
      client_id: "c",
    });
    await expect(loadRegistration("other")).resolves.toBeUndefined();
  });

  it("rejects a write the browser fails, and takes the next one", async () => {
    const session = {
      issuer: "https://idp.example/",
      client: { client_id: "c" },
      redirectUrl: "https://memo.example/",
      keys: await generateKeyPair("ES256"),
      webId: "https://alice.example/profile/card#me",
    };
    await saveSession(session);
    // The write fails as a request: adding over the key there is.
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (
      this: IDBObjectStore,
      value,
      key,
    ) {
      return this.add(value, key);
    });
    await expect(saveSession({ ...session, refreshToken: "r" })).rejects.toMatchObject({
      name: "ConstraintError",
    });
    await expect(loadSession()).resolves.not.toHaveProperty("refreshToken");
    await saveSession({ ...session, refreshToken: "r" });
    await expect(loadSession()).resolves.toHaveProperty("refreshToken", "r");
  });

  it("rejects when the browser refuses to open the database, and tries again on the next call", async () => {
    // A database at a later version than the store asks for: the browser refuses to open it.
    await new Promise((resolve) => {
      indexedDB.open("newer", 2).onsuccess = (event) => {
        (event.target as IDBOpenDBRequest).result.close();
        resolve(undefined);
      };
    });
    const open = indexedDB.open.bind(indexedDB);
    vi.spyOn(indexedDB, "open").mockImplementationOnce(() => open("newer", 1));
    vi.resetModules();
    const store = await import("./oidcStore");
    await expect(store.loadSession()).rejects.toMatchObject({ name: "VersionError" });
    await expect(store.loadRegistration("other")).resolves.toBeUndefined();
  });
});
