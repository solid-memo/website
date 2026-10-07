/**
 * The easing of the app's movements: a quick start that settles gently,
 * the curve style.css gives its own transitions and keyframes.
 */
export const EASE = "cubic-bezier(0.2, 0.8, 0.3, 1)";

/**
 * Whether the reader asks for reduced motion. The stylesheet then stops
 * every transition and animation, so a script must not wait for one to
 * end, and changes at once instead.
 */
export function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
