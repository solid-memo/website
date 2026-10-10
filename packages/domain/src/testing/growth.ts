/**
 * How many times longer work takes on an input `times` as large: the best
 * of three runs at each size, the sizes taken in turn after a run to warm
 * up. A wall-clock budget would depend on the machine: CI runs the tests,
 * coverage on, many times slower than a laptop. The ratio does not, and it
 * tells a linear pass (about `times`) from a quadratic one (`times`
 * squared).
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
  for (let round = 0; round < 3; round++) {
    let started = performance.now();
    small();
    fast = Math.min(fast, performance.now() - started);
    started = performance.now();
    large();
    slow = Math.min(slow, performance.now() - started);
  }
  return slow / fast;
}
