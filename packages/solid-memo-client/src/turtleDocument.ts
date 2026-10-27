// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { DatasetCore } from "@rdfjs/types";
import { Parser, Store } from "n3";

/** A failed read, with the response's status as Inrupt's FetchError has it. */
class TurtleFetchError extends Error {
  constructor(
    message: string,
    readonly response: Response,
  ) {
    super(message);
    this.name = "FetchError";
  }
  get statusCode(): number {
    return this.response.status;
  }
  get statusText(): string {
    return this.response.statusText;
  }
}

/**
 * The Turtle document at `url`, read through `fetch` and parsed with n3,
 * relative IRIs resolved against the URL the response came from: the
 * replacement for shacl's src/turtleDocument.ts that names no Inrupt library.
 */
export async function readTurtleDocument(
  url: string,
  fetch: typeof globalThis.fetch,
): Promise<DatasetCore> {
  const response = await fetch(url, { headers: { Accept: "text/turtle" } });
  if (!response.ok) {
    const body = await response.clone().text();
    throw new TurtleFetchError(
      `Fetching the Resource at [${url}] failed: [${response.status}] [${response.statusText}] ${body}.`,
      response,
    );
  }
  const baseIRI = response.url || url;
  return new Store(new Parser({ format: "text/turtle", baseIRI }).parse(await response.text()));
}
