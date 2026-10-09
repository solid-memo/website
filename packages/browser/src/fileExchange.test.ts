import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserFileExchange } from "./fileExchange";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** The file input open() put in the page. */
function picker(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>("input[type=file]")!;
}

/** The user picks these files in it. */
function pick(input: HTMLInputElement, files: { name: string; text: () => Promise<string> }[]) {
  Object.defineProperty(input, "files", { value: files });
  input.dispatchEvent(new Event("change"));
}

describe("createBrowserFileExchange", () => {
  it("saves text as a download by its name and media type, then lets its URL go", async () => {
    vi.useFakeTimers();
    let blob: Blob | undefined;
    vi.spyOn(URL, "createObjectURL").mockImplementation((made) => {
      blob = made as Blob;
      return "blob:file-1";
    });
    const revoked = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clicked: HTMLAnchorElement[] = [];
    document.addEventListener("click", (event) => {
      clicked.push(event.target as HTMLAnchorElement);
      event.preventDefault();
    });
    createBrowserFileExchange().save("capitals.ttl", "text/turtle", "<#a> <#b> <#c> .");
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("capitals.ttl");
    expect(clicked[0]!.getAttribute("href")).toBe("blob:file-1");
    expect(document.querySelector("a")).toBeNull();
    expect(blob!.type).toBe("text/turtle");
    expect(await blob!.text()).toBe("<#a> <#b> <#c> .");
    expect(revoked).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoked).toHaveBeenCalledWith("blob:file-1");
  });

  it("opens the file the user picks, of the kinds asked for", async () => {
    const opened = createBrowserFileExchange().open(".ttl,.jsonld");
    const input = picker();
    expect(input.accept).toBe(".ttl,.jsonld");
    pick(input, [{ name: "deck.ttl", text: async () => "turtle" }]);
    expect(await opened).toEqual({ name: "deck.ttl", text: "turtle" });
    expect(picker()).toBeNull();
  });

  it("opens none when the user closes the picker, or picks nothing", async () => {
    const exchange = createBrowserFileExchange();
    const cancelled = exchange.open(".ttl");
    picker().dispatchEvent(new Event("cancel"));
    expect(await cancelled).toBeNull();
    const empty = exchange.open(".ttl");
    pick(picker(), []);
    expect(await empty).toBeNull();
    expect(picker()).toBeNull();
  });

  it("fails when the file cannot be read", async () => {
    const opened = createBrowserFileExchange().open(".ttl");
    pick(picker(), [{ name: "deck.ttl", text: () => Promise.reject(new Error("unreadable")) }]);
    await expect(opened).rejects.toThrow("unreadable");
    expect(picker()).toBeNull();
  });
});
