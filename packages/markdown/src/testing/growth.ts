// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * How many times longer work takes on an input `times` as large than on
 * the small input done `times` over: about 1 for a linear pass, about
 * `times` for a quadratic one. Each is the best of five runs, the two
 * taken in turn after a run to warm up. The same measure as `growth` in
 * the domain package's tests (packages/domain/src/testing/growth.ts),
 * which says why each choice; this package imports no other.
 *
 * The time is the CPU time this test's process spends, not the time on
 * the clock: on CI, every package's tests run at once on two cores,
 * coverage on, and a long run waits for the processor where a short one
 * may not. Timed on the clock, a text read in linear time came out
 * slower than three times its first half.
 *
 * `prepare` builds the input of a size and returns the work to time, so
 * building it is not timed.
 */
export function growth(
  prepare: (size: number) => () => unknown,
  size: number,
  times: number,
): number {
  const small = prepare(size);
  const large = prepare(size * times);
  const smalls = () => {
    for (let time = 0; time < times; time++) small();
  };
  small();
  let fast = Infinity;
  let slow = Infinity;
  for (let round = 0; round < 5; round++) {
    fast = Math.min(fast, cpuTime(smalls));
    slow = Math.min(slow, cpuTime(large));
  }
  return slow / fast;
}

/** The CPU time `work` takes, in microseconds. */
export function cpuTime(work: () => unknown): number {
  const started = process.cpuUsage();
  work();
  const { user, system } = process.cpuUsage(started);
  return user + system;
}
