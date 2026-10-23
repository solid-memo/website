// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { checked, defaultIo, fileProblems, main, run } from "./checkQueryKeys.ts";

const MADE = `import { queryKeys } from "./queryKeys";

export function useDecks(instanceUrl: string) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.decks(instanceUrl);
  queryClient.setQueryData<Deck[]>(queryKeys.decks(instanceUrl), []);
  return useQuery({ queryKey, queryFn: () => [] });
}
`;

describe("checked", () => {
  it("reads the screens' TypeScript", () => {
    expect(checked("packages/ui/src/ui/Workspace.tsx")).toBe(true);
    expect(checked("apps/studio/src/ui/releaseCheck.ts")).toBe(true);
  });

  it("leaves out the keys modules, tests, tests' helpers and other files", () => {
    expect(checked("packages/ui/src/ui/queryKeys.ts")).toBe(false);
    expect(checked("apps/studio/src/ui/queryKeys.ts")).toBe(false);
    expect(checked("packages/ui/src/ui/Workspace.test.tsx")).toBe(false);
    expect(checked("apps/studio/src/ui/releaseCheck.test.ts")).toBe(false);
    expect(checked("packages/ui/src/test/useCasesFake.ts")).toBe(false);
    expect(checked("packages/ui/src/i18n/en.json")).toBe(false);
  });
});

describe("fileProblems", () => {
  it("accepts keys made by queryKeys", () => {
    expect(fileProblems("Decks.tsx", MADE)).toEqual([]);
  });

  it("refuses a query or mutation key written out, as a property, a variable or a condition's branch", () => {
    const source = `useQuery({ queryKey: ["decks", instanceUrl] });
queryClient.invalidateQueries({ queryKey: ["studyQueue"] });
const mutationKey = ["libraryUpgrade", deck.url];
useQuery({
  queryKey:
    deckUrl === undefined ? ["statistics", instanceUrl] : queryKeys.statistics(instanceUrl),
});
useQuery({
  queryKey: [
    "statistics",
  ],
});
`;
    expect(fileProblems("Decks.tsx", source)).toEqual([
      "Decks.tsx:1: a queryKey writes its key out; make it with a function of queryKeys.",
      "Decks.tsx:2: a queryKey writes its key out; make it with a function of queryKeys.",
      "Decks.tsx:3: a mutationKey writes its key out; make it with a function of queryKeys.",
      "Decks.tsx:5: a queryKey writes its key out; make it with a function of queryKeys.",
      "Decks.tsx:9: a queryKey writes its key out; make it with a function of queryKeys.",
    ]);
  });

  it("refuses a key written out in a QueryClient's read or write of a query", () => {
    const source = `queryClient.getQueryData<Deck[]>(["decks", instanceUrl]);
queryClient.setQueryData(
  ["reviews", url, key.cardId],
  state,
);
queryClient.getQueryState(["cards", url]);
`;
    expect(fileProblems("Decks.tsx", source)).toEqual([
      "Decks.tsx:1: a getQueryData writes its key out; make it with a function of queryKeys.",
      "Decks.tsx:2: a setQueryData writes its key out; make it with a function of queryKeys.",
      "Decks.tsx:6: a getQueryState writes its key out; make it with a function of queryKeys.",
    ]);
  });

  it("leaves a comment's keys alone", () => {
    const source = `/**
 * The decks (queryKey: ["decks", url]) are read once.
 */
// queryKey: ["decks", url]
/* queryKey: ["decks", url] */
`;
    expect(fileProblems("Decks.tsx", source)).toEqual([]);
  });
});

describe("main", () => {
  function fakeIo(files: Record<string, string>) {
    const logs: string[] = [];
    return {
      logs,
      files: () => Object.keys(files),
      read: (path: string) => files[path]!,
      log: (message: string) => logs.push(message),
    };
  }

  it("says so and returns 0 when no screen writes a key out", () => {
    const io = fakeIo({
      "packages/ui/src/ui/Decks.tsx": MADE,
      "packages/ui/src/ui/queryKeys.ts": `export const queryKeys = { decks: (url: string) => ["decks", url] };\nconst queryKey = ["x"];\n`,
      "packages/ui/src/ui/Decks.test.tsx": `queryClient.setQueryData(["decks", url], []);\n`,
    });
    expect(main(io)).toBe(0);
    expect(io.logs).toEqual(["None of the 1 source files writes a query key out."]);
  });

  it("logs each key written out and returns 1", () => {
    const io = fakeIo({
      "packages/ui/src/ui/Decks.tsx": MADE,
      "apps/studio/src/ui/Catalog.tsx": `\nuseQuery({ queryKey: ["catalog", url] });\n`,
    });
    expect(main(io)).toBe(1);
    expect(io.logs).toEqual([
      "apps/studio/src/ui/Catalog.tsx:2: a queryKey writes its key out; make it with a function of queryKeys.",
    ]);
  });
});

describe("the repository's screens", () => {
  it("make every query key with queryKeys", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const process = { exitCode: undefined as number | string | null | undefined };
    run(process);
    expect(process.exitCode).toBe(0);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^None of the \d+ source files/));
    log.mockRestore();
  });

  it("are read from Solid Memo's and the Studio's sources", () => {
    const io = defaultIo(`${import.meta.dirname}/..`);
    const files = io.files();
    expect(files).toContain("packages/ui/src/ui/Workspace.tsx");
    expect(files).toContain("apps/studio/src/ui/StudioWorkspace.tsx");
    expect(files.every((file) => /^(packages\/ui|apps\/studio)\/src\//.test(file))).toBe(true);
    expect(io.read("packages/ui/src/ui/Workspace.tsx")).toContain("queryKeys.");
  });
});
