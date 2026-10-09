import { describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/preact";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentChildren } from "preact";
import { makeUseCasesFake } from "../test/useCasesFake";
import { ThemeProvider, useInstanceTheme } from "./theme";

const INSTANCE = "https://pod.example/solid-memo/main/";

function InInstance({ instanceTheme }: { instanceTheme: () => Promise<"dark"> }) {
  useInstanceTheme(makeUseCasesFake({ instanceTheme: vi.fn(instanceTheme) }), INSTANCE);
  return null;
}

function withQueries(children: ComponentChildren) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useInstanceTheme", () => {
  it("does without a theme provider", async () => {
    const instanceTheme = vi.fn(async () => "dark" as const);
    render(withQueries(<InInstance instanceTheme={instanceTheme} />));
    await waitFor(() => expect(instanceTheme).toHaveBeenCalled());
  });

  it("does with a provider that neither follows instances nor adopts their theme", async () => {
    const instanceTheme = vi.fn(async () => "dark" as const);
    const { unmount } = render(
      withQueries(
        <ThemeProvider choice="system" onChoose={() => undefined}>
          <InInstance instanceTheme={instanceTheme} />
        </ThemeProvider>,
      ),
    );
    await waitFor(() => expect(instanceTheme).toHaveBeenCalled());
    unmount();
  });
});
