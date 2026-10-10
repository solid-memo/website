/**
 * How many times longer work takes on an input `times` as large: the best
 * of five runs at each size, the sizes taken in turn after a run to warm
 * up. A wall-clock budget would depend on the machine: CI runs the tests,
 * coverage on, many times slower than a laptop. The ratio does not, and it
 * tells a linear pass (about `times`) from a quadratic one (`times`
 * squared).
 *
 * The time is the CPU time this test's process spends, not the time on
 * the clock: on a machine busy with other tests, a long run is all but
 * sure to wait for the processor where a short one may not, which would
 * make even a linear pass look quadratic (a ratio of 17 for 4, with every
 * package's tests run at once on two cores).
 *
 * `prepare` builds the input of a size and returns the work to time, so
 * building it is not timed.
 */
export function growth(prepare: (size: number) => () => unknown, size: number, times: number): number {
  const small = prepare(size);
  const large = prepare(size * times);
  small();
  let fast = Infinity;
  let slow = Infinity;
  for (let round = 0; round < 5; round++) {
    fast = Math.min(fast, cpuTime(small));
    slow = Math.min(slow, cpuTime(large));
  }
  return slow / fast;
}

/** The CPU time `work` takes, in microseconds. */
function cpuTime(work: () => unknown): number {
  const started = process.cpuUsage();
  work();
  const { user, system } = process.cpuUsage(started);
  return user + system;
}
