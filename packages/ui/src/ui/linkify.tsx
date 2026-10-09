import { ExternalLink } from "./ExternalLink";

/** A URL in running text, minus any punctuation that closes the sentence. */
const URL_IN_TEXT = /(https?:\/\/[^\s]*[^\s.,;:!?)])/;

/**
 * The text with its web addresses as links, so a source can be visited.
 * The text comes from deck data, so every link goes through ExternalLink.
 */
export function linkify(text: string) {
  return text
    .split(URL_IN_TEXT)
    .map((part, i) =>
      i % 2 === 1 ? <ExternalLink key={i} url={part} /> : part,
    );
}
