import { describe, expect, it } from "vitest";
import { triplesOf } from "./ntriples";

const DOC = "https://pod.example/doc.ttl";

describe("triplesOf", () => {
  it("writes every kind of term as Solid Memo's PATCH bodies do", async () => {
    const triples = await triplesOf(
      DOC,
      `<#a> <#p> [ <#q> "x" ] ; <#r> "say \\"hi\\"\\n\\r\\\\"@en , 3 , "plain" .`,
    );
    const lines = [...triples];
    expect(lines).toContain(`<${DOC}#a> <${DOC}#r> "say \\"hi\\"\\n\\r\\\\"@en .`);
    expect(lines).toContain(`<${DOC}#a> <${DOC}#r> "3"^^<http://www.w3.org/2001/XMLSchema#integer> .`);
    expect(lines).toContain(`<${DOC}#a> <${DOC}#r> "plain" .`);
    const blank = lines.find((line) => line.startsWith(`<${DOC}#a> <${DOC}#p> _:`))!;
    const node = blank.split(" ")[2]!;
    expect(lines).toContain(`${node} <${DOC}#q> "x" .`);
  });

  it("rejects what does not parse", async () => {
    await expect(triplesOf(DOC, "<#a> <#p")).rejects.toThrow();
  });
});
