import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import { CopyLink } from "./CopyLink";

const URL = "https://pod.example/releases/solid/v1.ttl";

afterEach(() => vi.unstubAllGlobals());

describe("CopyLink", () => {
  it("copies the address, and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<CopyLink url={URL} label="Copy it" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy it" }));
    expect(await screen.findByText("Link copied.")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(URL);
  });

  it("says when the browser will not copy it", async () => {
    vi.stubGlobal("navigator", {});
    render(<CopyLink url={URL} label="Copy it" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy it" }));
    expect(await screen.findByText("The link could not be copied. Select its address and copy it.")).toBeInTheDocument();
  });
});
