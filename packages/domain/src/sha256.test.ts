// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "./sha256";

const bytesOf = (text: string) => new TextEncoder().encode(text);

describe("sha256Hex", () => {
  it("gives the published hashes of FIPS 180-4's examples", () => {
    expect(sha256Hex(bytesOf(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex(bytesOf("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex(bytesOf("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("agrees with Node's at every length around a block's padding, and past one block", () => {
    for (const length of [1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000, 33_000]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 31 + length) & 0xff);
      expect(sha256Hex(bytes), `${length}`).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });
});
