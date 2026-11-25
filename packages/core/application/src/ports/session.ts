// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/*
 * The driven ports of the sign-in: the identity provider's session, the WebID's profile, and the storages it names. The solid adapters implement them.
 */

import type { EstablishedSession } from "@solid-memo/domain/session";
import type { Storage } from "@solid-memo/domain/storage";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";

/**
 * Driven port: authentication against a Solid identity provider.
 * Implemented by the Solid infrastructure layer.
 */
export interface SessionGateway {
  /**
   * Complete a pending login redirect or restore a stored session. The
   * origin tells a just-completed login from a silent restore.
   */
  restore(): Promise<EstablishedSession | null>;
  /**
   * Subscribe to session expiry: a 401 from the pod, or the tab shown
   * again, online, with an access token that expired and was not renewed.
   * Returns an unsubscribe function.
   */
  onSessionExpired(listener: () => void): () => void;
  /**
   * Restores a session that expired as a reload does, by reloading the
   * page: the restore that load runs fails with `sessionNotRecovered`
   * when it brings no session back. Resolves only when the page stays:
   * no session is stored, this tab tried a while ago already, or the
   * reload did not leave (the learner chose to stay on a page with
   * unsaved edits).
   */
  recoverSession(): Promise<void>;
  /**
   * Subscribe to this page coming back from the browser's back/forward
   * cache, where it heard nothing, with no session stored any more.
   * Returns an unsubscribe function.
   */
  onReturnedWithoutSession(listener: () => void): () => void;
  /**
   * The identity provider the WebID profile declares (solid:oidcIssuer).
   * Never derived from the WebID's own origin: the two may differ.
   */
  discoverOidcIssuer(webId: string): Promise<string>;
  /**
   * Start the login flow for the given WebID. On success the browser
   * navigates away to the identity provider, so this never resolves
   * normally; it only rejects on failure.
   */
  login(webId: string): Promise<void>;
  /**
   * Start the login flow at a known identity provider, for users who pick
   * a provider instead of typing their WebID. Like login(), it only ever
   * rejects; the WebID arrives with the session after the redirect.
   */
  loginWithIssuer(oidcIssuer: string): Promise<void>;
  logout(): Promise<void>;
  /** Whether a session is stored in this browser for a restore to try. */
  hasStoredSession(): Promise<boolean>;
  /**
   * Ends the stored session without asking its identity provider, which
   * may never answer a restore, and what this tab kept for the restore:
   * the next load restores nothing.
   */
  forgetStoredSession(): Promise<void>;
}

/** Driven port: read access to WebID documents. */
export interface WebIdDocumentRepository {
  fetchWebIdDocument(webId: string): Promise<WebIdDocument>;
}

/** Driven port: discovery of storage roots in the user's pod(s). */
export interface StorageGateway {
  /**
   * All storages advertised for the WebID (profile pim:storage triples,
   * falling back to the server's Link-header discovery). May be empty.
   */
  discoverStorages(webId: string): Promise<Storage[]>;
  /** Validate a manually entered storage URL; rejects if unreachable. */
  probeStorage(url: string): Promise<Storage>;
}
