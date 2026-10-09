import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { WebIdDocumentView } from "./WebIdDocumentView";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import { newTab } from "../test/links";

const document: WebIdDocument = {
  url: "https://alice.example/profile/card",
  subjects: [
    {
      url: "https://alice.example/profile/card#me",
      properties: [
        {
          predicate: "http://xmlns.com/foaf/0.1/name",
          values: [
            {
              type: "literal",
              value: "Alice",
              dataType: "http://www.w3.org/2001/XMLSchema#string",
            },
          ],
        },
        {
          predicate: "http://example.org/vocab#mixed",
          values: [
            { type: "iri", value: "https://iri.example/x" },
            { type: "langString", value: "hej", language: "sv" },
            { type: "blankNode", value: "_:b0" },
          ],
        },
      ],
    },
  ],
};

describe("WebIdDocumentView", () => {
  it("renders each subject with its predicates and values", () => {
    render(<WebIdDocumentView document={document} />);

    expect(
      screen.getByRole("heading", {
        name: newTab("https://alice.example/profile/card#me"),
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("http://xmlns.com/foaf/0.1/name")).toBeInTheDocument();
    expect(
      screen.getByText('"Alice" (http://www.w3.org/2001/XMLSchema#string)'),
    ).toBeInTheDocument();
    expect(screen.getByText('"hej"@sv')).toBeInTheDocument();
    expect(screen.getByText("_:b0")).toBeInTheDocument();
  });

  it("makes subject and predicate URLs clickable links", () => {
    render(<WebIdDocumentView document={document} />);
    expect(
      screen.getByRole("link", { name: newTab("https://alice.example/profile/card#me") }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: newTab("http://xmlns.com/foaf/0.1/name") }),
    ).toHaveAttribute("href", "http://xmlns.com/foaf/0.1/name");
  });

  it("never turns a javascript: IRI from the pod into a link", () => {
    render(
      <WebIdDocumentView
        document={{
          url: "https://alice.example/profile/card",
          subjects: [
            {
              url: "https://alice.example/profile/card#me",
              properties: [
                {
                  predicate: "http://xmlns.com/foaf/0.1/homepage",
                  values: [{ type: "iri", value: "javascript:alert(1)" }],
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("javascript:alert(1)").closest("a")).toBeNull();
  });

  it("renders IRI values as links", () => {
    render(<WebIdDocumentView document={document} />);

    const link = screen.getByRole("link", { name: newTab("https://iri.example/x") });
    expect(link).toHaveAttribute("href", "https://iri.example/x");
  });
});
