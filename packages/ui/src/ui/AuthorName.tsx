// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Fragment } from "preact";
import { parseAuthor } from "@solid-memo/domain/author";
import { ExternalLink } from "./ExternalLink";

/**
 * An author as a deck names them. "Name <email>" shows the name as a
 * mailto link; a plain name is plain text. The literal is deck data, so
 * the link goes through ExternalLink, and it is made from the parsed
 * address's recipient alone: no header fields or fragment.
 */
export function AuthorName({ author }: { author: string }) {
  const { name, email } = parseAuthor(author);
  if (email === undefined) return <>{name}</>;
  const { pathname } = new URL(`mailto:${email}`);
  return <ExternalLink url={`mailto:${pathname}`}>{name}</ExternalLink>;
}

/** Several authors, comma-separated. */
export function AuthorNames({ authors }: { authors: string[] }) {
  return (
    <>
      {authors.map((author, i) => (
        <Fragment key={author}>
          {i > 0 && ", "}
          <AuthorName author={author} />
        </Fragment>
      ))}
    </>
  );
}
