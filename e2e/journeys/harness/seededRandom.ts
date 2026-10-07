/**
 * Replaces Math.random with a seeded generator (mulberry32), so the
 * shuffles a journey meets (the study queue, the library's preview) come
 * out the same in every run with the seed. Runs in the page, before its
 * scripts (page.addInitScript), so it refers to nothing outside itself.
 */
export function seedRandom(seed: number): void {
  let state = seed >>> 0;
  Math.random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
