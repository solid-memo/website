// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { randomUUID } from "node:crypto";
import { Parser } from "n3";

const LDP_CONTAINS = "http://www.w3.org/ns/ldp#contains";

/**
 * What the tests need of a server before they run, asked as anyone (no
 * login): a Turtle document PUT in the pod root reads back, the root
 * lists it at the URL it was written to (so the server knows the URL it
 * is reached at: a wrong base URL, port or trailing slash shows here,
 * not as every test failing), and it deletes. Throws saying which failed.
 */
export async function checkContract(root: string): Promise<void> {
  const url = new URL(`probe-${randomUUID()}.ttl`, root).href;
  const put = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "text/turtle" },
    body: `<#a> <#b> "1" .`,
  }).catch((error: Error) => {
    throw new Error(
      `${root} cannot be reached: ${(error.cause as Error | undefined)?.message ?? error.message}.`,
    );
  });
  if (!put.ok)
    throw new Error(`${root} does not let anyone write: PUT ${url} answered ${put.status}.`);
  let failure: Error | undefined;
  try {
    const read = await fetch(url, { headers: { accept: "text/turtle" } });
    if (read.status !== 200) throw new Error(`GET ${url} answered ${read.status} after the PUT.`);
    const listing = await fetch(root, { headers: { accept: "text/turtle" } });
    const quads = new Parser({ baseIRI: root }).parse(await listing.text());
    const listed = quads
      .filter((q) => q.predicate.value === LDP_CONTAINS)
      .map((q) => q.object.value);
    if (!listed.includes(url)) {
      throw new Error(
        `${root} does not list ${url} (it lists ${listed.join(", ") || "nothing"}): does the server know the URL it is reached at?`,
      );
    }
  } catch (error) {
    failure = error as Error;
  }
  const deleted = await fetch(url, { method: "DELETE" });
  if (failure) throw failure;
  if (!deleted.ok) throw new Error(`DELETE ${url} answered ${deleted.status}.`);
}
