// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { readDocument } from "./client/resources";
import { datasetFrom, readOf } from "./testing/datasets";
import { getSolidDatasetOrNull, readDataset, readsAsNone } from "./datasets";
import { HttpError, ReadLimitError } from "./client/interface";
import { AppError } from "@solid-memo/domain/appError";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return { ...actual, readDocument: vi.fn() };
});

const URL_ = "https://pod.example/doc.ttl";
const noFetch = vi.fn() as unknown as typeof globalThis.fetch;

describe("readsAsNone", () => {
  const limits = { bytes: 1, quads: 1, characters: 1 };

  it.each([
    ["not there (404)", new HttpError("404", new Response("", { status: 404 }))],
    ["gone (410)", Object.assign(new Error("410"), { response: { status: 410 } })],
    ["past its read limits", new ReadLimitError(URL_, limits)],
    ["not parsed (the library's plain Error)", new Error("Encountered an error parsing")],
    ["not parsed (a SyntaxError)", new SyntaxError("Unexpected token")],
    [
      "not parsed (a plain Error caused by the parser's)",
      new Error("Encountered an error parsing", { cause: new Error("Unexpected token") }),
    ],
  ])("takes a document that is %s as none", (_, error) => {
    expect(readsAsNone(error)).toBe(true);
  });

  it.each([
    ["refused (401)", new HttpError("401", new Response("", { status: 401 }))],
    ["forbidden (403)", Object.assign(new Error("403"), { statusCode: 403 })],
    ["a server failure (503)", Object.assign(new Error("503"), { statusCode: 503 })],
    ["no answer in time (podNoAnswer)", new AppError("podNoAnswer", { url: URL_ })],
    ["refused credentials", new AppError("credentialsRefused", { url: URL_ })],
    ["a refused redirect", new AppError("redirectRefused", { url: URL_ })],
    ["an abort", new DOMException("The operation was aborted.", "AbortError")],
    ["a network failure", new TypeError("Failed to fetch")],
    [
      "an abort with a reason of its own",
      new Error("The operation was aborted.", {
        cause: new DOMException("The operation was aborted.", "AbortError"),
      }),
    ],
    ["a plain Error named as an abort", Object.assign(new Error("x"), { name: "AbortError" })],
    [
      "an Error caused by no answer in time",
      new Error("wrapped", {
        cause: new Error("again", { cause: new AppError("podNoAnswer", { url: URL_ }) }),
      }),
    ],
    ["an Error caused by a network failure", new Error("wrapped", { cause: new TypeError("x") })],
    [
      "an Error caused by a refusal (401)",
      new Error("wrapped", {
        cause: Object.assign(new Error("401"), { statusCode: 401 }),
      }),
    ],
    [
      "an Error that is its own cause",
      (() => {
        const error = new Error("loop");
        error.cause = error;
        return error;
      })(),
    ],
    ["not an Error", "failed"],
    ["an object with a status that is not an Error", { statusCode: 404 }],
  ])("does not take a read that failed with %s as none", (_, error) => {
    expect(readsAsNone(error)).toBe(false);
  });
});

describe("readsAsNone of a read's own failure", () => {
  it("does not take a plain Error the read failed with before any answer as none, an abort's own reason say", async () => {
    const reason = new Error("cancelled");
    vi.mocked(readDocument).mockImplementation(async (url, { fetch }) => {
      await fetch(url);
      throw new Error("not reached");
    });
    const aborting = vi.fn().mockRejectedValue(reason) as unknown as typeof globalThis.fetch;

    const failure = await readDataset(URL_, aborting).catch((error: unknown) => error);

    expect(failure).toBe(reason);
    expect(readsAsNone(failure)).toBe(false);
  });

  it("takes a plain Error the read failed with after an answer as not parsed", async () => {
    const parse = new Error("Encountered an error parsing");
    vi.mocked(readDocument).mockImplementation(async (url, { fetch }) => {
      await fetch(url);
      throw parse;
    });
    const answering = vi
      .fn()
      .mockResolvedValue(new Response("<")) as unknown as typeof globalThis.fetch;

    const failure = await readDataset(URL_, answering).catch((error: unknown) => error);

    expect(failure).toBe(parse);
    expect(readsAsNone(failure)).toBe(true);
  });

  /** A fetch whose 200 Turtle answer comes, and whose body then fails with `reason`. */
  function failingBody(reason: unknown): typeof globalThis.fetch {
    return vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start: (controller) => controller.enqueue(new TextEncoder().encode("<a> <b> ")),
        pull: (controller) => controller.error(reason),
      });
      const response = new Response(body, { headers: { "Content-Type": "text/turtle" } });
      Object.defineProperty(response, "url", { value: URL_ });
      return response;
    }) as unknown as typeof globalThis.fetch;
  }

  async function readingWhole(): Promise<void> {
    const actual = await vi.importActual<typeof import("./client/resources")>("./client/resources");
    vi.mocked(readDocument).mockImplementation(actual.readDocument);
  }

  it("does not take a plain Error a body failed with after the answer as none, an abort's own reason say", async () => {
    await readingWhole();
    const reason = new Error("cancelled");

    const failure = await readDataset(URL_, failingBody(reason)).catch((error: unknown) => error);

    expect(failure).toBe(reason);
    expect(readsAsNone(failure)).toBe(false);
  });

  it("keeps a primitive a body failed with as it is", async () => {
    await readingWhole();

    const failure = await readDataset(URL_, failingBody("cancelled")).catch(
      (error: unknown) => error,
    );

    expect(readsAsNone(failure)).toBe(false);
  });

  it("takes a whole answer that does not parse as none", async () => {
    await readingWhole();
    const answering = vi.fn(async () => {
      const response = new Response("<a> <b>", { headers: { "Content-Type": "text/turtle" } });
      Object.defineProperty(response, "url", { value: URL_ });
      return response;
    }) as unknown as typeof globalThis.fetch;

    const failure = await readDataset(URL_, answering).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(readsAsNone(failure)).toBe(true);
  });

  it("keeps a primitive the read failed with as it is", async () => {
    vi.mocked(readDocument).mockRejectedValue("failed");

    await expect(readDataset(URL_, noFetch)).rejects.toBe("failed");
  });
});

describe("getSolidDatasetOrNull", () => {
  it("returns the dataset when the fetch succeeds", async () => {
    const dataset = datasetFrom(URL_);
    vi.mocked(readDocument).mockResolvedValue(readOf(dataset));
    await expect(getSolidDatasetOrNull(URL_, noFetch)).resolves.toBe(dataset);
  });

  it("returns null on a 404 via statusCode", async () => {
    vi.mocked(readDocument).mockRejectedValue(
      Object.assign(new Error("Not found"), { statusCode: 404 }),
    );
    await expect(getSolidDatasetOrNull(URL_, noFetch)).resolves.toBeNull();
  });

  it("returns null on a 404 via response.status", async () => {
    vi.mocked(readDocument).mockRejectedValue(
      Object.assign(new Error("Not found"), { response: { status: 404 } }),
    );
    await expect(getSolidDatasetOrNull(URL_, noFetch)).resolves.toBeNull();
  });

  it("rethrows other failures", async () => {
    vi.mocked(readDocument).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );
    await expect(getSolidDatasetOrNull(URL_, noFetch)).rejects.toThrow("Forbidden");
  });

  it("rethrows failures without any status information", async () => {
    vi.mocked(readDocument).mockRejectedValue(new Error("network"));
    await expect(getSolidDatasetOrNull(URL_, noFetch)).rejects.toThrow("network");
  });
});
