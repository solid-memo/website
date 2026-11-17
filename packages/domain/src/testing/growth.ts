// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * How many times longer work takes on an input `times` as large than on
 * the small input done `times` over: about 1 for a linear pass, about
 * `times` for a quadratic one. Each is the best of up to five runs, the
 * two taken in turn after a run to warm up. A wall-clock budget would depend
 * on the machine: CI runs the tests, coverage on, many times slower than a
 * laptop. The ratio does not.
 *
 * The small input is timed `times` over, not once, so that both runs do as
 * much work and allocate as much: a short run often finishes before the
 * garbage collector runs, where a long one never does. Timed once against
 * the large, a linear pass came out from 4 to over 10 for `times` 4, on a
 * busy machine too close to the 15 or 16 of a quadratic one.
 *
 * The time is the CPU time this test's process spends, not the time on
 * the clock: on a machine busy with other tests, a long run is all but
 * sure to wait for the processor where a short one may not, which would
 * make even a linear pass look quadratic (a ratio of 17 for 4, with every
 * package's tests run at once on two cores).
 *
 * The runs stop early once the ratio is under half of `limit`, the
 * bound the test holds it to (`clear`): all five rounds are needed only
 * near the limit, where the noise of a busy machine could tip it.
 *
 * `prepare` builds the input of a size and returns the work to time, so
 * building it is not timed.
 */
export function growth(
  prepare: (size: number) => () => unknown,
  size: number,
  times: number,
  limit: number,
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
    if (clear(slow / fast, limit)) break;
  }
  return slow / fast;
}

/**
 * growth for work that awaits (an adapter's check over an engine that
 * answers at once): the same two runs, each timed from its start until
 * its promise settles. Nothing else may run meanwhile, as in a test.
 */
export async function growthAsync(
  prepare: (size: number) => () => Promise<unknown>,
  size: number,
  times: number,
  limit: number,
): Promise<number> {
  const small = prepare(size);
  const large = prepare(size * times);
  const smalls = async () => {
    for (let time = 0; time < times; time++) await small();
  };
  await small();
  let fast = Infinity;
  let slow = Infinity;
  for (let round = 0; round < 5; round++) {
    fast = Math.min(fast, await cpuTimeAsync(smalls));
    slow = Math.min(slow, await cpuTimeAsync(large));
    if (clear(slow / fast, limit)) break;
  }
  return slow / fast;
}

/**
 * growthAsync for work that changes what it works on (a removal, a
 * format's upgrade, against a pod in memory): `prepare` gives, for a
 * size, the setup of one run, which resolves to the work to time. Each
 * run is set up afresh, and only its work is timed: an import that
 * puts the input in place would hide the work's growth in its own.
 */
export async function growthAfterSetup(
  prepare: (size: number) => () => Promise<() => Promise<unknown>>,
  size: number,
  times: number,
  limit: number,
): Promise<number> {
  const small = prepare(size);
  const large = prepare(size * times);
  const smalls = async () => {
    let total = 0;
    for (let time = 0; time < times; time++) total += await cpuTimeAsync(await small());
    return total;
  };
  await (await small())();
  let fast = Infinity;
  let slow = Infinity;
  for (let round = 0; round < 5; round++) {
    fast = Math.min(fast, await smalls());
    slow = Math.min(slow, await cpuTimeAsync(await large()));
    if (clear(slow / fast, limit)) break;
  }
  return slow / fast;
}

/**
 * Whether a ratio is far enough under `limit` that more rounds can't
 * change the outcome: under half of it. More rounds only take the best of
 * each run, which a busy machine can't make faster than the work is; a
 * ratio that looks too low comes only from small runs it slowed down.
 * Under half the limit, that takes small runs twice as slow as they are,
 * and four times for a pass in the square of the input, which comes out
 * about `times` (8, against a limit of 4).
 */
function clear(ratio: number, limit: number): boolean {
  return ratio < limit / 2;
}

/** The CPU time `work` takes until its promise settles, in microseconds. */
async function cpuTimeAsync(work: () => Promise<unknown>): Promise<number> {
  const started = process.cpuUsage();
  await work();
  const { user, system } = process.cpuUsage(started);
  return user + system;
}

/** The CPU time `work` takes, in microseconds. */
export function cpuTime(work: () => unknown): number {
  const started = process.cpuUsage();
  work();
  const { user, system } = process.cpuUsage(started);
  return user + system;
}
