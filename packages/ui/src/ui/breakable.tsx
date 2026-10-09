import { Fragment } from "preact";

/**
 * Card text as rendered, with a line-break opportunity (`<wbr>`) after
 * every "/": browsers do not break after a slash, so a long name like
 * "Fastighetstekniker/Drifttekniker, fastighet" would otherwise wrap in
 * the middle of a word. The text itself, and what it reads as, is
 * unchanged.
 */
export function breakable(text: string) {
  const parts = text.split("/");
  if (parts.length === 1) return text;
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </Fragment>
  ));
}
