// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Client } from "oauth4webapi";

/**
 * What the sign-in client (session.ts) keeps across reloads, in
 * IndexedDB: the session to restore, and the clients providers
 * registered the app as. IndexedDB, not localStorage, as it stores the
 * DPoP key pair as CryptoKey objects, the private key unexportable.
 * Access tokens are never stored: they live in memory (oidcSession.ts).
 */

/** The session a reload restores. */
export interface StoredSession {
  /** The provider's issuer identifier, as its metadata says it. */
  issuer: string;
  /** The client the app logged in as. */
  client: Client;
  /** The redirect URL the client is registered with. */
  redirectUrl: string;
  /** The DPoP key pair the tokens are bound to. */
  keys: CryptoKeyPair;
  webId: string;
  /** None when the provider gave none: a reload then asks the provider again (prompt=none). */
  refreshToken?: string;
}

const DATABASE = "solid-memo-oidc";
const SESSIONS = "session";
const REGISTRATIONS = "registrations";
const CURRENT = "current";

let opened: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SESSIONS);
      request.result.createObjectStore(REGISTRATIONS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opened = undefined;
      reject(request.error);
    };
  });
  return opened;
}

/** Runs one request on `store` and resolves once its transaction is done. */
async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, mode);
    const request = operation(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(request.result);
    // A failed request aborts its transaction, the error kept on it.
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function loadSession(): Promise<StoredSession | undefined> {
  return run<StoredSession | undefined>(SESSIONS, "readonly", (store) => store.get(CURRENT));
}

export async function saveSession(session: StoredSession): Promise<void> {
  await run(SESSIONS, "readwrite", (store) => store.put(session, CURRENT));
}

/**
 * Stores `next` in place of `read`, the session as a refresh read it,
 * only while that one is still stored: the same refresh token, WebID and
 * issuer. One transaction, so nothing comes in between. False, and
 * nothing written, once a logout cleared it or a login replaced it.
 */
export async function replaceSession(read: StoredSession, next: StoredSession): Promise<boolean> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(SESSIONS, "readwrite");
    const store = transaction.objectStore(SESSIONS);
    let replaced = false;
    const current = store.get(CURRENT);
    current.onsuccess = () => {
      const stored = current.result as StoredSession | undefined;
      replaced =
        stored !== undefined &&
        stored.refreshToken === read.refreshToken &&
        stored.webId === read.webId &&
        stored.issuer === read.issuer;
      if (replaced) store.put(next, CURRENT);
    };
    transaction.oncomplete = () => resolve(replaced);
    transaction.onabort = () => reject(transaction.error);
  });
}

/** Forgets the session; the registrations stay, as they name the app, not the user. */
export async function clearSession(): Promise<void> {
  await run(SESSIONS, "readwrite", (store) => store.delete(CURRENT));
}

/** The client a provider registered the app as, by issuer and redirect URL. */
export async function loadRegistration(key: string): Promise<Client | undefined> {
  return run<Client | undefined>(REGISTRATIONS, "readonly", (store) => store.get(key));
}

export async function saveRegistration(key: string, client: Client): Promise<void> {
  await run(REGISTRATIONS, "readwrite", (store) => store.put(client, key));
}
