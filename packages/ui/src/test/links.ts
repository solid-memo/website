/** What an ExternalLink to the web adds to its name: it opens in a new tab. */
export const NEW_TAB = " (opens in a new tab)";

/** The accessible name of an ExternalLink to the web with text `text`. */
export function newTab(text: string): string {
  return `${text}${NEW_TAB}`;
}
