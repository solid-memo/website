import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/preact";
import {
  collapsedGroups,
  forget,
  recentLanguages,
  rememberCollapsed,
  rememberLanguage,
  useRemembered,
} from "./remembered";

function Counter({ memoryKey }: { memoryKey: string }) {
  const [count, setCount] = useRemembered(memoryKey, 0);
  return <button onClick={() => setCount((n) => n + 1)}>{count}</button>;
}

describe("useRemembered", () => {
  it("starts from the initial value", () => {
    render(<Counter memoryKey="fresh" />);
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });

  it("brings the value back when a component asks for its key again", () => {
    const first = render(<Counter memoryKey="kept" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    render(<Counter memoryKey="kept" />);
    expect(screen.getByRole("button")).toHaveTextContent("2");
  });

  it("keeps each key's value apart", () => {
    const first = render(<Counter memoryKey="one" />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    render(<Counter memoryKey="two" />);
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });

  it("starts afresh once the key is forgotten", () => {
    const first = render(<Counter memoryKey="dropped" />);
    fireEvent.click(screen.getByRole("button"));
    first.unmount();
    forget("dropped");
    render(<Counter memoryKey="dropped" />);
    expect(screen.getByRole("button")).toHaveTextContent("0");
  });
});

describe("recent languages", () => {
  beforeEach(() => localStorage.clear());

  it("are none at first", () => {
    expect(recentLanguages("deck")).toEqual([]);
  });

  it("lists the latest choice first, each once, five at most", () => {
    for (const tag of ["en", "sv", "fi", "de", "sv", "ja", "fr"]) rememberLanguage("own", tag);
    expect(recentLanguages("own")).toEqual(["fr", "ja", "sv", "de", "fi"]);
  });

  it("keeps a deck's text and a card's own text apart", () => {
    rememberLanguage("deck", "sv");
    expect(recentLanguages("deck")).toEqual(["sv"]);
    expect(recentLanguages("own")).toEqual([]);
  });

  it("are kept on this device, past the page", () => {
    rememberLanguage("deck", "pt-br");
    expect(JSON.parse(localStorage.getItem("solid-memo:recentLanguages.deck")!)).toEqual(["pt-br"]);
  });

  it("leave out what is not a language tag as the app stores it", () => {
    localStorage.setItem("solid-memo:recentLanguages.own", JSON.stringify(["sv", 7, "PT-BR", "x-private", "fi"]));
    expect(recentLanguages("own")).toEqual(["sv", "fi"]);
    localStorage.setItem("solid-memo:recentLanguages.own", "{not json");
    expect(recentLanguages("own")).toEqual([]);
    localStorage.setItem("solid-memo:recentLanguages.own", JSON.stringify({ sv: true }));
    expect(recentLanguages("own")).toEqual([]);
  });

  it("are none, and are not kept, when the browser's storage refuses", () => {
    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(recentLanguages("deck", refusing)).toEqual([]);
    expect(() => rememberLanguage("deck", "sv", refusing)).not.toThrow();
  });
});

describe("collapsed deck groups", () => {
  const a = "https://pod.example/solid-memo/a/";
  const b = "https://pod.example/solid-memo/b/";
  beforeEach(() => localStorage.clear());

  it("are none at first", () => {
    expect(collapsedGroups(a)).toEqual([]);
  });

  it("are kept on this device, for each instance apart", () => {
    rememberCollapsed(a, [`${a}catalog.ttl#group-1`]);
    expect(collapsedGroups(a)).toEqual([`${a}catalog.ttl#group-1`]);
    expect(collapsedGroups(b)).toEqual([]);
    expect(JSON.parse(localStorage.getItem(`solid-memo:collapsedGroups.${a}`)!)).toEqual([`${a}catalog.ttl#group-1`]);
  });

  it("leave out what is not a URL as the app stores it", () => {
    localStorage.setItem(`solid-memo:collapsedGroups.${a}`, JSON.stringify(["x", 7]));
    expect(collapsedGroups(a)).toEqual(["x"]);
    localStorage.setItem(`solid-memo:collapsedGroups.${a}`, "{not json");
    expect(collapsedGroups(a)).toEqual([]);
    localStorage.setItem(`solid-memo:collapsedGroups.${a}`, JSON.stringify({ x: true }));
    expect(collapsedGroups(a)).toEqual([]);
  });

  it("are none, and are not kept, when the browser's storage refuses", () => {
    const refusing = () => {
      throw new Error("SecurityError");
    };
    expect(collapsedGroups(a, refusing)).toEqual([]);
    expect(() => rememberCollapsed(a, ["x"], refusing)).not.toThrow();
  });
});
