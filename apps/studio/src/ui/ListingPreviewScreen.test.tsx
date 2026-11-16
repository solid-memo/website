// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/preact";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { courseDraft } from "../test/fixtures";
import { ListingPreviewScreen } from "./ListingPreviewScreen";

describe("ListingPreviewScreen", () => {
  it("shows the draft's row in the library and its page, as learners will see them, inert", () => {
    render(<ListingPreviewScreen draft={courseDraft()} />);
    expect(screen.getByRole("heading", { level: 2, name: "Listing preview" })).toBeInTheDocument();
    const previews = document.querySelectorAll(".listing-preview");
    expect(previews).toHaveLength(2);
    for (const preview of previews) expect(preview).toHaveAttribute("inert");
    // Hidden from assistive technology as inert, so read from the markup.
    const row = previews[0] as HTMLElement;
    expect(row.querySelector(".library-deck-name")).toHaveTextContent("Solid");
    expect(row.querySelector(".library-course")).toHaveTextContent("Course");
    expect(row).toHaveTextContent("2 cards");
    const page = previews[1] as HTMLElement;
    expect(page.querySelector("h2")).toHaveTextContent("Solid");
    // Pressing what is there does nothing.
    fireEvent.click(within(page).getByText("Start course"));
    expect(screen.getByRole("heading", { level: 2, name: "Listing preview" })).toBeInTheDocument();
  });

  it("draws no more sources, nor authors of a source, than learners' page does, however many the draft states (GHSA-46q4-pmpc-mj5j)", () => {
    const draft = courseDraft();
    const count = 5_000;
    const urls = Array.from({ length: count }, (_, n) => `https://many.example/${n}`);
    const literal = (value: string) => ({
      kind: "literal" as const,
      value,
      language: "",
      datatype: "http://www.w3.org/2001/XMLSchema#string",
    });
    const many: ReleaseDraft = {
      ...draft,
      root: { ...draft.root, wasDerivedFrom: urls },
      triples: urls.map((_, n) => ({
        subject: urls[0]!,
        predicate: "http://purl.org/dc/terms/creator",
        object: literal(`Author ${n}`),
      })),
    };
    render(<ListingPreviewScreen draft={many} />);
    const page = document.querySelectorAll(".listing-preview")[1] as HTMLElement;
    const sources = page.querySelector("details")!;
    expect(sources.querySelector("summary")).toHaveTextContent("5,000 sources");
    expect(sources.querySelectorAll("li")).toHaveLength(50);
    expect(sources).toHaveTextContent("And 4,950 more sources, not listed here.");
    expect(sources.querySelectorAll("li")[0]).toHaveTextContent("Author 49 and 4,950 more");
    expect(page.querySelectorAll("*").length).toBeLessThan(2_000);
  });
});
