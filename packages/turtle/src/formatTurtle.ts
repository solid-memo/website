import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Parser, type Quad, type Quad_Subject, type Term } from "n3";
import { readTurtleTree, type TurtleFile } from "./rdf.ts";

/**
 * The house style for the repository's hand-written Turtle (ns/, decks/
 * and the vocab package's fixtures/; a published version is formatted
 * once, before it is published, and never changes after, and vendor/ is
 * not ours, so it is never reformatted): `@base` first, prefixes aligned
 * in one block, every subject on a line of its own, one predicate per line
 * indented four spaces, further objects aligned under the first, and a
 * blank line between subjects. Lists and blank nodes stay inline.
 *
 * `npm run format:turtle` rewrites the files; `npm run format:turtle:check`
 * fails on any that differ. Each package names its own folders on the
 * command line. Formatting parses and re-serialises, which
 * would lose comments, so comment blocks are carried over to the subject
 * they precede — and a file whose comments cannot all be placed that way
 * is refused rather than rewritten.
 *
 * A literal whose text has a line feed (Markdown, say) is written as a
 * long string, `"""…"""`, its lines verbatim and never indented, for
 * leading spaces can matter in them; every other literal is written on
 * one line, as before.
 */

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const BARE_DATATYPES = [`${XSD}integer`, `${XSD}decimal`, `${XSD}boolean`];

interface SubjectBlock {
  subject: Quad_Subject;
  quads: Quad[];
}

/**
 * The document reformatted. `fallbackBase` resolves relative IRIs when
 * the document declares no `@base`; it never appears in the output.
 * With `relativeTo`, IRIs under that folder are written relative to it
 * (the library index, which works wherever the site is hosted).
 */
export function formatTurtle(
  source: string,
  fallbackBase: string,
  { relativeTo }: { relativeTo?: string } = {},
): string {
  const lines = turtleLines(source);
  let base = fallbackBase;
  let declaresBase = false;
  const prefixes: [string, string][] = [];
  for (const line of lines) {
    const baseMatch = /^@base\s+<([^>]*)>/.exec(line);
    if (baseMatch !== null) {
      base = baseMatch[1];
      declaresBase = true;
    }
    const prefixMatch = /^@prefix\s+([^:\s]*):\s+<([^>]*)>/.exec(line);
    if (prefixMatch !== null) prefixes.push([prefixMatch[1], prefixMatch[2]]);
  }

  const comments = commentsBySubject(lines);
  const quads = new Parser({ baseIRI: base }).parse(source);
  const blocks = new Map<string, SubjectBlock>();
  for (const quad of quads) {
    const key = termKey(quad.subject);
    const block = blocks.get(key) ?? { subject: quad.subject, quads: [] };
    block.quads.push(quad);
    blocks.set(key, block);
  }
  const inlined = new Set(
    quads
      .filter((quad) => quad.object.termType === "BlankNode")
      .map((quad) => quad.object.value),
  );

  const iri = (value: string): string => {
    for (const [name, namespace] of prefixes) {
      const local = value.slice(namespace.length);
      if (value.startsWith(namespace) && /^[A-Za-z0-9_-]+$/.test(local)) {
        return `${name}:${local}`;
      }
    }
    if (value === base) return "<>";
    if (value.startsWith(`${base}#`)) return `<#${value.slice(base.length + 1)}>`;
    if (relativeTo !== undefined && value.startsWith(relativeTo)) {
      return `<${value.slice(relativeTo.length)}>`;
    }
    return `<${value}>`;
  };

  const listMembers = (head: Term): Term[] => {
    const members: Term[] = [];
    let node = head;
    while (!(node.termType === "NamedNode" && node.value === `${RDF}nil`)) {
      const block = blocks.get(termKey(node as Quad_Subject))!;
      members.push(block.quads.find((q) => q.predicate.value === `${RDF}first`)!.object);
      node = block.quads.find((q) => q.predicate.value === `${RDF}rest`)!.object;
    }
    return members;
  };

  const term = (t: Term): string => {
    if (t.termType === "NamedNode") return iri(t.value);
    if (t.termType === "Literal") {
      const text = t.value.includes("\n") ? longString(t.value) : JSON.stringify(t.value);
      if (t.language !== "") return `${text}@${t.language}`;
      const datatype = t.datatype.value;
      if (BARE_DATATYPES.includes(datatype)) return t.value;
      return datatype === `${XSD}string` ? text : `${text}^^${iri(datatype)}`;
    }
    const block = blocks.get(termKey(t as Quad_Subject));
    if (block === undefined) return "[]";
    if (block.quads.some((q) => q.predicate.value === `${RDF}first`)) {
      return `( ${listMembers(t).map(term).join(" ")} )`;
    }
    const inner = predicateGroups(block.quads)
      .map(([predicate, objects]) => `${predicate} ${objects.join(", ")}`)
      .join(" ; ");
    return `[ ${inner} ]`;
  };

  const predicateGroups = (qs: Quad[]): [string, string[]][] => {
    const groups: [string, string[]][] = [];
    for (const quad of qs) {
      // `a` abbreviates rdf:type as a predicate only; elsewhere it is an IRI.
      const predicate = quad.predicate.value === `${RDF}type` ? "a" : term(quad.predicate);
      const last = groups[groups.length - 1];
      if (last !== undefined && last[0] === predicate) last[1].push(term(quad.object));
      else groups.push([predicate, [term(quad.object)]]);
    }
    return groups;
  };

  const output: string[] = [];
  if (declaresBase) output.push(`@base <${base}> .`, "");
  const width = Math.max(0, ...prefixes.map(([name]) => name.length + 1));
  for (const [name, namespace] of prefixes) {
    output.push(`@prefix ${`${name}:`.padEnd(width)} <${namespace}> .`);
  }
  if (prefixes.length > 0) output.push("");
  for (const { subject, quads: qs } of blocks.values()) {
    if (subject.termType === "BlankNode" && inlined.has(subject.value)) continue;
    const label = subject.termType === "BlankNode" ? "[]" : term(subject);
    output.push(...(comments.get(label) ?? []), label);
    const groups = predicateGroups(qs);
    groups.forEach(([predicate, objects], index) => {
      const end = index === groups.length - 1 ? " ." : " ;";
      const continuation = `,\n${" ".repeat(5 + predicate.length)}`;
      output.push(`    ${predicate} ${objects.join(` ${continuation}`)}${end}`);
    });
    output.push("");
  }
  const formatted = output.join("\n");
  const commentLines = (text: string) =>
    turtleLines(text).filter((line) => line.trimStart().startsWith("#")).length;
  if (commentLines(formatted) !== commentLines(source)) {
    throw new Error(
      "a comment does not directly precede a subject and would be lost; move it or format by hand.",
    );
  }
  return formatted;
}

/**
 * A literal's text as a long string: a backslash and each control
 * character but a tab or a line feed escaped (a carriage return as
 * `\r`, so a file's line ends say nothing of its text), and a double
 * quote escaped where it would end or run into a delimiter: at either
 * end, and every third of a run.
 */
function longString(value: string): string {
  const escaped = value
    // A backslash, and each control character but a tab (\u0009) or a line feed (\u000a).
    .replace(/[\\\u0000-\u0008\u000b-\u001f]/g, (c) => (c === "\\" ? "\\\\" : JSON.stringify(c).slice(1, -1)))
    .replace(/"+/g, (run, offset: number, whole: string) =>
      offset === 0 || offset + run.length === whole.length
        ? '\\"'.repeat(run.length)
        : [...run].map((quote, i) => (i % 3 === 2 ? '\\"' : quote)).join(""),
    );
  return `"""${escaped}"""`;
}

/**
 * The lines of a Turtle document that are its own: a line that begins
 * inside a long string is a literal's text (a Markdown heading's `#`
 * there is no comment), so it is given as an empty line, and nothing it
 * says is read as a comment or a directive. Only a long string runs on
 * past a line's end: a comment, an IRI or a short string ends with it.
 */
function turtleLines(source: string): string[] {
  /** The delimiter of the long string open as the line begins, if any. */
  let open: string | null = null;
  return source.split("\n").map((line) => {
    const own = open === null ? line : "";
    let quote = open;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      if (quote !== null) {
        if (c === "\\") i++;
        else if (line.startsWith(quote, i)) {
          i += quote.length - 1;
          quote = null;
        }
      } else if (c === "\\") i++; // An escape in a prefixed name, `ex:a\#b`: its `#` begins no comment.
      else if (c === "#") break;
      else if (c === "<") {
        const end = line.indexOf(">", i);
        i = end === -1 ? line.length : end;
      } else if (c === '"' || c === "'") {
        quote = line.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
        i += quote.length - 1;
      }
    }
    open = quote?.length === 3 ? quote : null;
    return own;
  });
}

/**
 * Comment blocks (blank lines within and after them included) keyed by
 * the first token of the line that follows them.
 */
function commentsBySubject(lines: string[]): Map<string, string[]> {
  const comments = new Map<string, string[]>();
  let block: string[] = [];
  for (const line of lines) {
    if (line.trimStart().startsWith("#")) {
      block.push(line);
    } else if (line.trim() === "") {
      if (block.length > 0) block.push("");
    } else if (block.length > 0) {
      const token = line.trim().split(/\s+/)[0];
      comments.set(token, [...(comments.get(token) ?? []), ...block]);
      block = [];
    }
  }
  return comments;
}

function termKey(term: Term): string {
  return `${term.termType}:${term.value}`;
}

export interface FormatIo {
  readTurtleTree(dir: string): Promise<TurtleFile[]>;
  writeFile(path: string, text: string): Promise<void>;
  log(message: string): void;
}

export function defaultIo(root: string): FormatIo {
  return {
    readTurtleTree: (dir) => readTurtleTree(join(root, dir)),
    writeFile: (path, text) => writeFile(join(root, path), text),
    log: (message) => console.log(message),
  };
}

/**
 * Every Turtle file under the house-style folders, formatted. In check
 * mode nothing is written and the files that differ are returned.
 */
export async function formatFiles(
  io: FormatIo,
  { check, folders }: { check: boolean; folders: readonly string[] },
): Promise<{ changed: string[] }> {
  const changed: string[] = [];
  for (const folder of folders) {
    for (const { path, turtle } of await io.readTurtleTree(folder)) {
      const file = `${folder}/${path}`;
      let formatted: string;
      try {
        formatted = formatTurtle(turtle, `https://format.invalid/${file}`);
      } catch (error) {
        throw new Error(`${file}: ${(error as Error).message}`);
      }
      if (formatted === turtle) continue;
      changed.push(file);
      if (!check) await io.writeFile(file, formatted);
    }
  }
  return { changed };
}

/** Exit code: 0 when written (or, with --check, all formatted), 1 otherwise. */
export async function main(argv: readonly string[], io: FormatIo): Promise<number> {
  const check = argv.includes("--check");
  // The folders are the arguments after the script's own (argv[0] is node).
  const folders = argv.slice(1).filter((arg) => !arg.startsWith("-"));
  const { changed } = await formatFiles(io, { check, folders });
  for (const file of changed) {
    io.log(check ? `${file} is not formatted: run \`npm run format:turtle\`.` : `formatted ${file}`);
  }
  return check && changed.length > 0 ? 1 : 0;
}

/** The script entry: `node -e "import('@solid-memo/turtle/formatTurtle').then((m) => m.run(process))" -- [--check] <folder>…`. */
export async function run(
  process: { argv: readonly string[]; cwd(): string; exitCode?: number },
): Promise<void> {
  process.exitCode = await main(process.argv, defaultIo(process.cwd()));
}
