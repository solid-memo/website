/**
 * The names an aria snapshot (Playwright's `locator.ariaSnapshot()`)
 * gives the elements of a role, in the order it lists them. A line is
 * `- radio "Text"`, followed by states such as `[checked]`, or, when the
 * line would not read as plain YAML (a name with ": " in it), the same
 * in single quotes, its own quotes doubled: `- 'radio "A: b"'`.
 */
export function ariaNames(snapshot: string, role: string): string[] {
  const names: string[] = [];
  for (const raw of snapshot.split("\n")) {
    let line = raw.trim().replace(/^- /, "").replace(/:$/, "");
    if (line.startsWith("'") && line.endsWith("'")) line = line.slice(1, -1).replaceAll("''", "'");
    const match = /^(\S+) ("(?:[^"\\]|\\.)*")/.exec(line);
    if (match !== null && match[1] === role) names.push(JSON.parse(match[2]!) as string);
  }
  return names;
}
