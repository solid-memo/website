/**
 * Whether a Markdown link is followed, and where it leads: only an
 * absolute `https:` URL without a user name or password is
 * (docs/markdown.md). Every other one — `javascript:`, `data:`, `http:`,
 * `mailto:`, a relative or `#/route` link — is shown as its text, so
 * pod data can neither run script, steer the app to a route of its own,
 * fill in a mail, nor hide its host behind `user@`. The host is returned
 * as the URL parser has it (punycode kept), to be shown beside a link
 * whose text is not its URL.
 */
export function liveLink(url: string): { href: string; host: string } | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") return null;
  return { href: parsed.href, host: parsed.host };
}
