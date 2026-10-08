import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Parser } from "n3";
import { describe, expect, it, vi } from "vitest";
import {
  defaultIo,
  formatFiles,
  formatTurtle,
  main,
  run,
  type FormatIo,
} from "./formatTurtle.ts";

const BASE = "https://example.com/doc.ttl";

const PREFIXES = `@prefix ex: <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`;

describe("formatTurtle", () => {
  it("lays out prefixes, subjects, predicates and objects in the house style", () => {
    const source = `@base <${BASE}> .
${PREFIXES}<> a ex:Thing ; ex:name "A \\"quoted\\" name", "B"@en ; ex:count 2 ; ex:ratio 2.5 ; ex:flag true ;
  ex:when "2026-09-21T10:00:00Z"^^xsd:dateTime ; ex:link <https://other.example/x> ; ex:odd "x"^^<https://other.example/dt> .
<#b> ex:name "b" .
<https://example.com/doc.ttl#c> ex:name "c" .
`;
    expect(formatTurtle(source, "https://ignored.invalid/")).toBe(`@base <${BASE}> .

@prefix ex:  <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<>
    a ex:Thing ;
    ex:name "A \\"quoted\\" name" ,
            "B"@en ;
    ex:count 2 ;
    ex:ratio 2.5 ;
    ex:flag true ;
    ex:when "2026-09-21T10:00:00Z"^^xsd:dateTime ;
    ex:link <https://other.example/x> ;
    ex:odd "x"^^<https://other.example/dt> .

<#b>
    ex:name "b" .

<#c>
    ex:name "c" .
`);
  });

  it("resolves relative IRIs against the fallback base when the document declares none", () => {
    expect(formatTurtle(`${PREFIXES}<#a> ex:link <> , <#b> .`, BASE)).toBe(`@prefix ex:  <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#a>
    ex:link <> ,
            <#b> .
`);
  });

  it("keeps lists and blank nodes inline, and unreferenced blank subjects as []", () => {
    const source = `${PREFIXES}<#a> ex:or ( [ ex:path ex:x ; ex:min 1 ] [ ex:path ex:y ; ex:min 1 ] ) ; ex:in ( "p" "q" ) ; ex:node [ ex:path ex:z ] ; ex:empty [] .
[] ex:name "anon" .
`;
    expect(formatTurtle(source, BASE)).toBe(`@prefix ex:  <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#a>
    ex:or ( [ ex:path ex:x ; ex:min 1 ] [ ex:path ex:y ; ex:min 1 ] ) ;
    ex:in ( "p" "q" ) ;
    ex:node [ ex:path ex:z ] ;
    ex:empty [] .

[]
    ex:name "anon" .
`);
  });

  it("carries comment blocks over to the subject they precede, blank lines included", () => {
    const source = `${PREFIXES}
# About a.
# Two lines.

<#a> ex:name "a" .
#### section ####

<#b> ex:name "b" .
`;
    expect(formatTurtle(source, BASE)).toBe(`@prefix ex:  <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# About a.
# Two lines.

<#a>
    ex:name "a" .

#### section ####

<#b>
    ex:name "b" .
`);
  });

  it("refuses a document whose comments it cannot place", () => {
    expect(() =>
      formatTurtle(`${PREFIXES}<#a> ex:name "a" ;\n  # between predicates\n  ex:count 1 .`, BASE),
    ).toThrow("a comment does not directly precede a subject and would be lost; move it or format by hand.");
  });

  it("abbreviates rdf:type to `a` as a predicate only", () => {
    const turtle = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
<#p> a sh:PropertyShape ; sh:path rdf:type .`;
    expect(formatTurtle(turtle, BASE)).toBe(`@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix sh:  <http://www.w3.org/ns/shacl#> .

<#p>
    a sh:PropertyShape ;
    sh:path rdf:type .
`);
  });

  it("writes IRIs under a folder relative to it when asked", () => {
    const turtle = `<https://example.com/lib/index.ttl> <https://example.com/ns#has> <https://example.com/lib/a/1.ttl>, <https://example.com/lib/index.ttl#b>, <https://other.example/x> .`;
    expect(formatTurtle(turtle, "https://example.com/lib/index.ttl", { relativeTo: "https://example.com/lib/" })).toBe(`<>
    <https://example.com/ns#has> <a/1.ttl> ,
                                 <#b> ,
                                 <https://other.example/x> .
`);
  });

  it("writes a literal with a line feed as a long string, its lines verbatim", () => {
    const source = String.raw`<#a> ex:text "Run:\n\n    npm test\n\n| a | b |"@en , "x\ny" , "1\n2"^^xsd:token ; ex:one "no\\nfeed" .`;
    const formatted = formatTurtle(`${PREFIXES}${source}`, BASE);
    expect(formatted).toBe(`@prefix ex:  <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

<#a>
    ex:text """Run:

    npm test

| a | b |"""@en ,
            """x
y""" ,
            """1
2"""^^xsd:token ;
    ex:one "no\\\\nfeed" .
`);
    expect(formatTurtle(formatted, BASE)).toBe(formatted);
  });

  it("escapes in a long string what would end it early or be lost, so it reads back the same text", () => {
    const values = [
      'say "hi"\nthen ""go""',
      '"quoted"\nlines"',
      'a """ b\nc """" d',
      "back\\slash\\n and \\\nend\\",
      "crlf\r\nline\r\n",
      "tab\there\nbell\u0007 and form\f",
      "''' single\n'",
    ];
    const source = `${PREFIXES}<#a> ex:text ${values.map((v) => JSON.stringify(v)).join(" , ")} .`;
    const formatted = formatTurtle(source, BASE);
    const read = new Parser({ baseIRI: BASE }).parse(formatted).map((quad) => quad.object.value);
    expect(read).toEqual(values);
    expect(formatted).toContain(String.raw`"""\"quoted"` + "\n" + String.raw`lines\""""`);
    expect(formatted).toContain(String.raw`"""a ""\" b` + "\n" + String.raw`c ""\"" d"""`);
    expect(formatted).toContain(String.raw`"""crlf\r` + "\n" + String.raw`line\r` + "\n" + `"""`);
    expect(formatted).toContain(`"""tab\there\nbell${String.raw`\u0007`} and form${String.raw`\f`}"""`);
    expect(formatTurtle(formatted, BASE)).toBe(formatted);
  });

  it("reads no comment or directive in a long string's lines, whichever quotes delimit it", () => {
    const source = `${PREFIXES}
# About a.
<#a> ex:text """# Not a comment
@prefix no: <https://no.example/> .
<#not-a-subject> \\"""" ; ex:more '''#also text
''' ; ex:link <https://example.com/x#y> ; ex:short "#\\"#" .

# About b.
<#b> ex:name "b" .
`;
    const formatted = formatTurtle(source, BASE);
    expect(formatted).toBe(`@prefix ex:  <https://example.com/ns#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

# About a.
<#a>
    ex:text """# Not a comment
@prefix no: <https://no.example/> .
<#not-a-subject> \\"""" ;
    ex:more """#also text
""" ;
    ex:link <https://example.com/x#y> ;
    ex:short "#\\"#" .

# About b.
<#b>
    ex:name "b" .
`);
    expect(formatTurtle(formatted, BASE)).toBe(formatted);
  });

  it("reads an escaped # in a prefixed name as part of the name, not a comment", () => {
    const formatted = formatTurtle(`${PREFIXES}<#a> ex:te\\#xt """Intro\n# Heading\n""" .`, BASE);
    expect(formatted).toContain(`<https://example.com/ns#te#xt> """Intro\n# Heading\n""" .`);
  });

  it("refuses Turtle it cannot read, an IRI left open among it", () => {
    expect(() => formatTurtle(`<#a> <https://example.com/ns#name "a" .`, BASE)).toThrow();
  });

  it("is idempotent, and handles a document without prefixes", () => {
    const once = formatTurtle(`<#a> <https://example.com/ns#name> "a" .`, BASE);
    expect(once).toBe(`<#a>\n    <https://example.com/ns#name> "a" .\n`);
    expect(formatTurtle(once, BASE)).toBe(once);
  });
});

function fakeIo(files: Record<string, string>): FormatIo & { written: Record<string, string>; logs: string[] } {
  const io = {
    written: {} as Record<string, string>,
    logs: [] as string[],
    readTurtleTree: async (dir: string) =>
      Object.entries(files)
        .filter(([path]) => path.startsWith(`${dir}/`))
        .map(([path, turtle]) => ({ path: path.slice(dir.length + 1), turtle })),
    writeFile: async (path: string, text: string) => {
      io.written[path] = text;
    },
    log: (message: string) => io.logs.push(message),
  };
  return io;
}

describe("formatFiles and main", () => {
  const unformatted = `@prefix ex: <https://example.com/ns#> .\n<#a> ex:name "a" .\n`;
  const formatted = `@prefix ex: <https://example.com/ns#> .\n\n<#a>\n    ex:name "a" .\n`;

  it("writes only the files that differ, in the folders it is given", async () => {
    const io = fakeIo({ "decks/x.ttl": unformatted, "shapes/deck/v1.ttl": formatted, "other/o.ttl": unformatted });
    expect(await main(["node", "decks", "shapes"], io)).toBe(0);
    expect(io.written).toEqual({ "decks/x.ttl": formatted });
    expect(io.logs).toEqual(["formatted decks/x.ttl"]);
  });

  it("checks without writing", async () => {
    const io = fakeIo({ "vocab/v1.ttl": unformatted, "decks/y.ttl": formatted });
    expect(await main(["node", "--check", "vocab", "decks"], io)).toBe(1);
    expect(io.written).toEqual({});
    expect(io.logs).toEqual(["vocab/v1.ttl is not formatted: run `npm run format:turtle`."]);
    expect(await main(["node", "--check", "decks"], fakeIo({ "decks/y.ttl": formatted }))).toBe(0);
  });

  it("names the file it refuses", async () => {
    const io = fakeIo({ "decks/z.ttl": `<#a> <https://example.com/ns#n> "a" ;\n  # stray\n  <https://example.com/ns#m> "b" .` });
    await expect(formatFiles(io, { check: true, folders: ["decks"] })).rejects.toThrow("decks/z.ttl: a comment does not directly precede a subject");
  });
});

describe("run and defaultIo", () => {
  it("sets the exit code from the files under its working directory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solid-memo-run-"));
    await mkdir(join(dir, "decks"));
    await writeFile(join(dir, "decks", "a.ttl"), `<#a>\n    <https://example.com/ns#name> "a" .\n`);
    const process = { argv: ["node", "--check", "decks"], cwd: () => dir, exitCode: undefined as number | undefined };
    await run(process);
    expect(process.exitCode).toBe(0);
    await writeFile(join(dir, "decks", "b.ttl"), `<#b> <https://example.com/ns#name> "b" .`);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await run(process);
    log.mockRestore();
    expect(process.exitCode).toBe(1);
  });

  it("writes relative to its root and logs through the console", async () => {
    const dir = await mkdtemp(join(tmpdir(), "solid-memo-format-"));
    await defaultIo(dir).writeFile("out.ttl", "x");
    expect(await readFile(join(dir, "out.ttl"), "utf8")).toBe("x");
    await writeFile(join(dir, "in.ttl"), "y");
    expect(await defaultIo(dir).readTurtleTree(".")).toEqual([
      { path: "in.ttl", turtle: "y" },
      { path: "out.ttl", turtle: "x" },
    ]);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    defaultIo(dir).log("hello");
    expect(log).toHaveBeenCalledWith("hello");
    log.mockRestore();
  });
});
