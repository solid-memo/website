// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/** The round constants of SHA-256 (FIPS 180-4). */
const K = Uint32Array.of(
  0x428a2f98,
  0x71374491,
  0xb5c0fbcf,
  0xe9b5dba5,
  0x3956c25b,
  0x59f111f1,
  0x923f82a4,
  0xab1c5ed5,
  0xd807aa98,
  0x12835b01,
  0x243185be,
  0x550c7dc3,
  0x72be5d74,
  0x80deb1fe,
  0x9bdc06a7,
  0xc19bf174,
  0xe49b69c1,
  0xefbe4786,
  0x0fc19dc6,
  0x240ca1cc,
  0x2de92c6f,
  0x4a7484aa,
  0x5cb0a9dc,
  0x76f988da,
  0x983e5152,
  0xa831c66d,
  0xb00327c8,
  0xbf597fc7,
  0xc6e00bf3,
  0xd5a79147,
  0x06ca6351,
  0x14292967,
  0x27b70a85,
  0x2e1b2138,
  0x4d2c6dfc,
  0x53380d13,
  0x650a7354,
  0x766a0abb,
  0x81c2c92e,
  0x92722c85,
  0xa2bfe8a1,
  0xa81a664b,
  0xc24b8b70,
  0xc76c51a3,
  0xd192e819,
  0xd6990624,
  0xf40e3585,
  0x106aa070,
  0x19a4c116,
  0x1e376c08,
  0x2748774c,
  0x34b0bcb5,
  0x391c0cb3,
  0x4ed8aa4a,
  0x5b9cca4f,
  0x682e6ff3,
  0x748f82ee,
  0x78a5636f,
  0x84c87814,
  0x8cc70208,
  0x90befffa,
  0xa4506ceb,
  0xbef9a3f7,
  0xc67178f2,
);

const rotated = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/**
 * The SHA-256 hash of `bytes`, in hexadecimal. For a value that has to
 * be named while a synchronous step runs, where the browser's own
 * (crypto.subtle) cannot be waited for; not for anything secret.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const message = new Uint8Array((((bytes.length + 8) >>> 6) + 1) * 64);
  message.set(bytes);
  message[bytes.length] = 0x80;
  const view = new DataView(message.buffer);
  view.setUint32(message.length - 8, Math.floor(bytes.length / 0x20000000));
  view.setUint32(message.length - 4, bytes.length << 3);

  const state = Uint32Array.of(
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  );
  const w = new Uint32Array(64);
  for (let block = 0; block < message.length; block += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block + t * 4);
    for (let t = 16; t < 64; t++) {
      const x = w[t - 15]!;
      const y = w[t - 2]!;
      const s0 = rotated(x, 7) ^ rotated(x, 18) ^ (x >>> 3);
      const s1 = rotated(y, 17) ^ rotated(y, 19) ^ (y >>> 10);
      w[t] = w[t - 16]! + s0 + w[t - 7]! + s1;
    }
    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;
    for (let t = 0; t < 64; t++) {
      const big1 = rotated(e, 6) ^ rotated(e, 11) ^ rotated(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + big1 + choice + K[t]! + w[t]!) | 0;
      const big0 = rotated(a, 2) ^ rotated(a, 13) ^ rotated(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      h = g;
      g = f;
      f = e;
      e = (d + first) | 0;
      d = c;
      c = b;
      b = a;
      a = (first + big0 + majority) | 0;
    }
    for (const [i, word] of [a, b, c, d, e, f, g, h].entries()) state[i]! += word;
  }
  return Array.from(state, (word) => word.toString(16).padStart(8, "0")).join("");
}
