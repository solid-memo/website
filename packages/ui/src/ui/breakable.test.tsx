import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import { breakable } from "./breakable";

describe("breakable", () => {
  it("lets a line break after each slash, keeping the text as it is", () => {
    const { container } = render(<p>{breakable("Fastighetstekniker/Drifttekniker, fastighet")}</p>);
    expect(container.querySelector("p")!.innerHTML).toBe("Fastighetstekniker/<wbr>Drifttekniker, fastighet");
    expect(container).toHaveTextContent("Fastighetstekniker/Drifttekniker, fastighet");
  });

  it("leaves text without a slash alone", () => {
    expect(breakable("Drifttekniker")).toBe("Drifttekniker");
  });
});
