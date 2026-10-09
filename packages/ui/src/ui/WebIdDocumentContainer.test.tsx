import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WebIdDocumentContainer } from "./WebIdDocumentContainer";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Session } from "@solid-memo/domain/session";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
import { makeUseCasesFake } from "../test/useCasesFake";

const session: Session = { webId: "https://alice.example/profile/card#me" };
const document: WebIdDocument = {
  url: "https://alice.example/profile/card",
  subjects: [
    {
      url: session.webId,
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
      ],
    },
  ],
};

function renderContainer(useCases: UseCases) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <WebIdDocumentContainer useCases={useCases} session={session} />
    </QueryClientProvider>,
  );
}

describe("WebIdDocumentContainer", () => {
  it("shows the session's WebID document", async () => {
    const useCases = makeUseCasesFake({
      viewWebIdDocument: vi.fn(async () => document),
    });
    renderContainer(useCases);

    expect(screen.getByText("WebID document")).toBeInTheDocument();
    expect(
      await screen.findByText('"Alice" (http://www.w3.org/2001/XMLSchema#string)'),
    ).toBeInTheDocument();
    expect(useCases.viewWebIdDocument).toHaveBeenCalledWith(session);
  });

  it("shows a loading indicator while the document is being fetched", async () => {
    renderContainer(
      makeUseCasesFake({
        viewWebIdDocument: vi.fn(() => new Promise<WebIdDocument>(() => {})),
      }),
    );
    expect(await screen.findByText("Loading profile…")).toBeInTheDocument();
  });

  it("shows a document error (Error instance)", async () => {
    renderContainer(
      makeUseCasesFake({
        viewWebIdDocument: vi.fn(async () => {
          throw new Error("profile fetch failed");
        }),
      }),
    );
    expect(await screen.findByText("profile fetch failed")).toBeInTheDocument();
  });

  it("shows a document error (non-Error rejection)", async () => {
    renderContainer(
      makeUseCasesFake({
        viewWebIdDocument: vi.fn(async () => {
          throw "document broke";
        }),
      }),
    );
    expect(await screen.findByText("document broke")).toBeInTheDocument();
  });
});
