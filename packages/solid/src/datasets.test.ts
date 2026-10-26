// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { readDocument } from "./client/resources";
import { datasetFrom, readOf } from "./testing/datasets";
import { getSolidDatasetOrNull } from "./datasets";

vi.mock("./client/resources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client/resources")>();
  return { ...actual, readDocument: vi.fn() };
});

const URL_ = "https://pod.example/doc.ttl";
const noFetch = vi.fn() as unknown as typeof globalThis.fetch;

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
