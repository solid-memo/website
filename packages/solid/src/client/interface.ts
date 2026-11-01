// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Literal, Quad } from "@rdfjs/types";

/**
 * The client modules' interface: the types their operations take and
 * give, and the error a failed request rejects with, with no library
 * behind them. rdf.ts, resources.ts, session.ts and access.ts implement
 * it over the current library and export these again; another
 * implementation exports the same, and passes the same contract tests
 * (src/testing/contract/), which each module's own tests run against
 * this one. No Solid client library is imported here
 * (scripts/checkBoundaries.ts).
 */

/**
 * A document's triples, as read from a pod or built to be written. What
 * else it holds is the implementation's: only its operations read it.
 */
export interface Dataset {
  readonly type: "Dataset";
}

declare const sourced: unique symbol;
declare const fetched: unique symbol;

/** A dataset that knows the document it came from (getSourceUrl). */
export interface SourcedDataset extends Dataset {
  readonly [sourced]: true;
}

/** A dataset as read from a pod, with what the server said of it. */
export interface FetchedDataset extends SourcedDataset {
  readonly [fetched]: true;
}

/** The triples of one subject of a dataset, by a URL or local to it. */
export interface Subject {
  readonly type: "Subject";
  /** The subject's IRI; for one made by name and not saved yet, one only the implementation reads (localNameOf). */
  readonly url: string;
}

/** A subject with a URL of its own; the types do not tell it from one made by name. */
export type NamedSubject = Subject;

/** Adds a subject's triples one call at a time (buildThing): each call gives the builder again. */
export interface SubjectBuilder {
  addIri(property: string, value: string | Subject): SubjectBuilder;
  addUrl(property: string, value: string | Subject): SubjectBuilder;
  addBoolean(property: string, value: boolean): SubjectBuilder;
  addDatetime(property: string, value: Date): SubjectBuilder;
  addDecimal(property: string, value: number): SubjectBuilder;
  addInteger(property: string, value: number): SubjectBuilder;
  addLiteral(property: string, value: Literal): SubjectBuilder;
  addStringNoLocale(property: string, value: string): SubjectBuilder;
  addStringWithLocale(property: string, value: string, locale: string): SubjectBuilder;
  setIri(property: string, value: string | Subject): SubjectBuilder;
  setInteger(property: string, value: number): SubjectBuilder;
  setStringNoLocale(property: string, value: string): SubjectBuilder;
  removeAll(property: string): SubjectBuilder;
  removeLiteral(property: string, value: Literal): SubjectBuilder;
  removeUrl(property: string, value: string | Subject): SubjectBuilder;
  /**
   * The property's IRIs become `values`, each once, in the order given;
   * its other values stay. One call for a list of any length, where an
   * add or a remove at each value takes time in the square of the list.
   */
  setIriAll(property: string, values: readonly string[]): SubjectBuilder;
  /**
   * The property's strings, with a language or without one (`""`),
   * become `values`, each once (a language as addStringWithLocale reads
   * it); its other values stay. One call for a list of any length
   * (setIriAll).
   */
  setStringAll(property: string, values: readonly LanguageString[]): SubjectBuilder;
  /**
   * The property's literals of `datatype` whose lexical form is one of
   * `values` removed, as removeLiteral removes one; its other values
   * stay. One call for a list of any length (setIriAll).
   */
  removeLiteralAll(property: string, datatype: string, values: readonly string[]): SubjectBuilder;
  /** The subject with every triple added. */
  build(): NamedSubject;
}

/** A string, with its language; `""` for one without a language. */
export interface LanguageString {
  readonly value: string;
  readonly language: string;
}

/** What has changed in a dataset since it was read or built, to be written as a patch. */
export interface Changes {
  readonly additions: readonly Quad[];
  readonly deletions: readonly Quad[];
}

/** The document a dataset was read from, or saved to. */
export interface Source {
  /** The document's URL. */
  readonly url: string;
  /** The same object for the dataset and every edit of it, and for no other: a key to keep what is known of the read (an ETag). */
  readonly key: object;
}

/** A value of a subject's property, by its kind: what a WebID document shows. */
export type PropertyValue =
  | { type: "iri"; value: string }
  | { type: "literal"; value: string; dataType: string }
  | { type: "langString"; value: string; language: string }
  | { type: "blankNode"; value: string };

/** How a request is sent: through `fetch`, the browser's own when none is given. */
export interface RequestOptions {
  fetch?: typeof globalThis.fetch;
}

/** The server answered a request with a failure: `statusCode` says which. */
export class HttpError extends Error {
  /** The response's status. */
  readonly statusCode: number;

  constructor(
    message: string,
    /** The server's response. */
    readonly response: Response,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HttpError";
    this.statusCode = response.status;
  }
}

/**
 * How much of a document a read takes in: its body's bytes, the triples
 * parsed from it, and the characters of their terms (readLimits.ts,
 * quadTally).
 */
export interface ReadLimits {
  readonly bytes: number;
  readonly quads: number;
  readonly characters: number;
}

/**
 * What a read rejects with when the document is larger than its limits
 * allow (readLimits.ts): its body, as sent or as said in advance
 * (Content-Length), or the triples parsed from it, or their terms; or
 * when a Turtle text's base or prefix declarations are past what any
 * read takes in, its limits then NO_SIZE_LIMITS for a read with none.
 * What was read so far is dropped.
 */
export class ReadLimitError extends Error {
  constructor(
    /** The document's URL. */
    readonly url: string,
    /** The limits it went past. */
    readonly limits: ReadLimits,
  ) {
    super(
      limits.bytes === Number.POSITIVE_INFINITY
        ? `The document at [${url}] has more or longer base or prefix declarations than a read takes in.`
        : `The document at [${url}] is larger than a read takes in: ${limits.bytes} bytes, ${limits.quads} triples, ${limits.characters} characters of terms, a few base and prefix declarations.`,
    );
    this.name = "ReadLimitError";
  }
}

/**
 * What a read of a document gave: the dataset, with the version (ETag)
 * the pod gave it, or that the document is still at the version asked
 * about (304).
 */
export type DocumentRead =
  | { readonly dataset: FetchedDataset; readonly etag: string | undefined }
  | { readonly notModified: true };

/** What a write of a document gave: the dataset as now saved there, and the version (ETag) the pod answered with. */
export interface DocumentWrite {
  readonly dataset: FetchedDataset;
  readonly etag: string | undefined;
}

/**
 * The sign-in client: the Solid-OIDC session the browser keeps for this
 * tab. What the app does around a login, the route it returns to and the
 * issuer it asks a WebID for, is solidSessionGateway.ts's.
 */
export interface SessionClient {
  /**
   * Completes a login the identity provider sent the user back from or,
   * failing that, restores the previous session, silently. Only a
   * redirect this tab set off, by a login or a silent restore, is
   * completed: a provider's answer on the page's URL that it did not ask
   * for leaves the stored session as it is.
   */
  restore(): Promise<RestoredSession>;
  /**
   * The identity provider of the session restore() would restore
   * silently, by sending the browser there; none without one.
   */
  sessionIssuer(): Promise<string | null>;
  /**
   * The identity provider the login request with this `state` went to,
   * where restore() would redeem the code answering it; none for a
   * request this client did not send, or no longer holds.
   */
  requestIssuer(state: string): Promise<string | null>;
  /** Sends the browser to the identity provider; does not return. */
  login(options: LoginOptions): Promise<void>;
  /** Ends the session. */
  logout(): Promise<void>;
  /** Fetches as the session's user: the current session's, never one from before a login. */
  fetch: typeof globalThis.fetch;
  /** The logged-in user's WebID, as the session has it now; none when logged out. */
  webId(): string | undefined;
}

/** What restore found. */
export interface RestoredSession {
  /** The user's WebID; null when no one is logged in. */
  webId: string | null;
  /** Whether a login just completed, not a silent restore. */
  fromLogin: boolean;
  /** The page a silent restore left for the identity provider, if it left one. */
  restoredFrom: string | null;
}

/** Where a login goes, and who the app says it is. */
export interface LoginOptions {
  /** The identity provider. */
  oidcIssuer: string;
  /** Where the provider sends the user back to. */
  redirectUrl: string;
  /** The name the app registers under when the provider registers it dynamically. */
  clientName: string;
  /** The app's Client ID Document, when it is the client ID. */
  clientId?: string;
}

/**
 * Make the document at `url` readable by everyone, and nothing else:
 * whether the pod says it now is. Rejects when the requests fail. Only
 * `fetch` is used, for every request it makes.
 */
export type GrantPublicRead = (
  url: string,
  options: { fetch: typeof globalThis.fetch },
) => Promise<boolean>;
