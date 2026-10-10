/**
 * The shooters, in the order they pop: where along the bottom of the
 * viewport each stands, in percent, and how far it leans, in degrees
 * (positive leans right), so the sides shoot in over the middle.
 */
const SHOOTERS = [
  { x: 15, lean: 15 },
  { x: 85, lean: -15 },
  { x: 50, lean: 0 },
];

/** How many pieces each shooter pops. */
const PIECES = 24;

/** Seconds between one shooter's pop and the next. */
const PAUSE = 0.28;

/**
 * A number in [0, 1) that looks random but follows from `index` and
 * `salt` alone, so the confetti flies the same way every time, while
 * pieces side by side, or of one colour, fly unalike.
 */
function scatter(index: number, salt: number): number {
  const wave = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return wave - Math.floor(wave);
}

/** `value` to at most two decimals, followed by `unit`. */
function round(value: number, unit: string): string {
  return `${Math.round(value * 100) / 100}${unit}`;
}

/**
 * Confetti over the page, for a course just completed (style.css): three
 * shooters along the bottom of the viewport pop in quick succession, each
 * shooting a cone of pieces in the app's colours up at its own angle,
 * which then flutter slowly back down and are gone, all in under five
 * seconds (WCAG 2.2.2). Decoration only: hidden from assistive technology, out of the
 * pointer's way, and fixed over the viewport, so it moves nothing on the
 * page. Each piece's angle, height, sway, spin and timing follow from its
 * index, so it flies the same way every time. With motion reduced it
 * shows nothing at all: a piece at rest is transparent.
 */
export function Confetti() {
  return (
    <div class="confetti" aria-hidden="true">
      {SHOOTERS.map(({ x, lean }, shooter) => (
        <div key={shooter} class="confetti-shooter" style={{ "--x": `${x}%`, "--delay": round(shooter * PAUSE, "s") }}>
          {Array.from({ length: PIECES }, (_, piece) => {
            const index = shooter * PIECES + piece + 1;
            const angle = ((lean + (scatter(index, 1) - 0.5) * 50) * Math.PI) / 180;
            const power = 0.6 + 0.4 * scatter(index, 2);
            const side = piece % 2 ? 1 : -1;
            return (
              <span
                key={piece}
                style={{
                  "--dx": round(power * 55 * Math.sin(angle), "vw"),
                  "--rise": round(power * 85 * Math.cos(angle), "vh"),
                  "--sway": round(side * (1 + scatter(index, 3) * 2), "vw"),
                  "--spin": `${side * ((index % 4) + 2) * 180}deg`,
                  "--flip": `${((index % 3) + 2) * 360}deg`,
                  "--time": round(3 + scatter(index, 4) * 1.2, "s"),
                  "--jitter": round(scatter(index, 5) * 0.08, "s"),
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
