// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { getSolidDataset, mockSolidDatasetFrom } from "@inrupt/solid-client";
import { getSolidDatasetOrNull } from "./datasets";

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, getSolidDataset: vi.fn() };
});

const URL_ = "https://pod.example/doc.ttl";
const noFetch = vi.fn() as unknown as typeof globalThis.fetch;

describe("getSolidDatasetOrNull", () => {
  it("returns the dataset when the fetch succeeds", async () => {
    const dataset = mockSolidDatasetFrom(URL_);
    vi.mocked(getSolidDataset).mockResolvedValue(dataset);
    await expect(getSolidDatasetOrNull(URL_, noFetch)).resolves.toBe(dataset);
  });

  it("returns null on a 404 via statusCode", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue(
      Object.assign(new Error("Not found"), { statusCode: 404 }),
    );
    await expect(getSolidDatasetOrNull(URL_, noFetch)).resolves.toBeNull();
  });

  it("returns null on a 404 via response.status", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue(
      Object.assign(new Error("Not found"), { response: { status: 404 } }),
    );
    await expect(getSolidDatasetOrNull(URL_, noFetch)).resolves.toBeNull();
  });

  it("rethrows other failures", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue(
      Object.assign(new Error("Forbidden"), { statusCode: 403 }),
    );
    await expect(getSolidDatasetOrNull(URL_, noFetch)).rejects.toThrow("Forbidden");
  });

  it("rethrows failures without any status information", async () => {
    vi.mocked(getSolidDataset).mockRejectedValue(new Error("network"));
    await expect(getSolidDatasetOrNull(URL_, noFetch)).rejects.toThrow("network");
  });
});
