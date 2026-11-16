// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Fragment } from "preact";
import { parseAuthor } from "@solid-memo/domain/author";
import { bounded } from "./bounded";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";

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

/**
 * Several authors, comma-separated: the first LIST_LIMIT of them, then
 * how many more there are of `count` in all (bounded), as a release may
 * name any number and a listing keeps only its first (authorCount).
 */
export function AuthorNames({ authors, count }: { authors: string[]; count?: number }) {
  const { t } = useI18n();
  const { shown, more } = bounded(authors, count);
  return (
    <>
      {shown.map((author, i) => (
        <Fragment key={author}>
          {i > 0 && ", "}
          <AuthorName author={author} />
        </Fragment>
      ))}
      {more > 0 && `${shown.length > 0 ? " " : ""}${t("authorNames.more", { count: more })}`}
    </>
  );
}
