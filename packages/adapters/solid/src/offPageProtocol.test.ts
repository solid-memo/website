// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { AppError } from "@solid-memo/domain/appError";
import { HttpError, ReadLimitError } from "@solid-memo/solid-client/interface";
import { RELEASE_LIMITS } from "@solid-memo/solid-client/readLimits";
import { frozenPaths, fromSent, refreeze, toSent } from "./offPageProtocol";

/** The error as the other side of the channel makes it again. */
const across = (error: unknown) => fromSent(structuredClone(toSent(error)));

describe("an error sent between the page and a worker", () => {
  it("is made again as the kind of error it was, with what tells it apart", () => {
    const app = across(new AppError("releaseUnreadable", { url: "https://a.example/r.ttl" }));
    expect(app).toBeInstanceOf(AppError);
    expect(app).toMatchObject({
      code: "releaseUnreadable",
      vars: { url: "https://a.example/r.ttl" },
    });

    const limit = across(new ReadLimitError("https://a.example/r.ttl", RELEASE_LIMITS));
    expect(limit).toBeInstanceOf(ReadLimitError);
    expect(limit).toMatchObject({ url: "https://a.example/r.ttl", limits: RELEASE_LIMITS });

    const http = across(new HttpError("Not Found", new Response(null, { status: 404 })));
    expect(http).toBeInstanceOf(HttpError);
    expect(http).toMatchObject({ message: "Not Found", statusCode: 404 });
  });

  it("keeps the kinds of Error a fetch or a parser fails with, and the name of any other", () => {
    expect(across(new TypeError("offline"))).toBeInstanceOf(TypeError);
    expect(across(new SyntaxError("bad"))).toBeInstanceOf(SyntaxError);
    expect(across(new RangeError("deep"))).toBeInstanceOf(RangeError);
    const abort = across(new DOMException("stopped", "AbortError"));
    expect(abort).toBeInstanceOf(DOMException);
    expect(abort.name).toBe("AbortError");
    expect(across(new DOMException("late", "TimeoutError")).name).toBe("TimeoutError");
    const named = new Error("odd");
    named.name = "OddError";
    expect(across(named)).toMatchObject({ name: "OddError", message: "odd" });
    expect(Object.getPrototypeOf(across(new Error("plain")))).toBe(Error.prototype);
  });

  it("sends what is thrown that is no Error as a plain one, and names the page's own by an id", () => {
    expect(across("a string")).toMatchObject({ name: "Error", message: "a string" });
    expect(toSent(new Error("x"), 3)).toEqual({
      kind: "error",
      name: "Error",
      message: "x",
      ref: 3,
    });
  });
});

describe("a result sent from a worker", () => {
  it("is frozen again where it was frozen, each part once however often it is named", () => {
    const shared = Object.freeze({ id: "q" });
    const result = {
      outline: Object.freeze({ chapters: Object.freeze([Object.freeze({ steps: [shared] })]) }),
      again: shared,
      open: { list: [1, 2] },
      date: new Date(0),
    };
    const paths = frozenPaths(result);
    expect(paths).toEqual([
      ["outline"],
      ["outline", "chapters"],
      ["outline", "chapters", 0],
      ["outline", "chapters", 0, "steps", 0],
    ]);
    const copy = refreeze(structuredClone(result), paths);
    expect(Object.isFrozen(copy.outline.chapters[0])).toBe(true);
    expect(Object.isFrozen(copy.again)).toBe(true);
    expect(Object.isFrozen(copy.open)).toBe(false);
    expect(Object.isFrozen(copy.outline.chapters[0]!.steps)).toBe(false);
  });

  it("frozen whole when it is, and as it is when it is no object", () => {
    expect(
      refreeze(structuredClone(Object.freeze([1])), frozenPaths(Object.freeze([1]))),
    ).toSatisfy(Object.isFrozen);
    expect(frozenPaths("text")).toEqual([]);
  });
});
