import { Fragment } from "preact";
import { parseAuthor } from "@solid-memo/domain/author";
import { ExternalLink } from "./ExternalLink";

/**
 * An author as a deck names them. "Name <email>" shows the name as a
 * mailto link; a plain name is plain text. The literal is deck data, so
 * the link goes through ExternalLink.
 */
export function AuthorName({ author }: { author: string }) {
  const { name, email } = parseAuthor(author);
  if (email === undefined) return <>{name}</>;
  return <ExternalLink url={`mailto:${email}`}>{name}</ExternalLink>;
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
