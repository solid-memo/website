/** How many pieces fall. */
const PIECES = 40;

/**
 * Confetti over the page, for a course just completed (style.css): a few
 * dozen pieces in the app's colours fall, drift and spin for under three
 * seconds, then are gone. Decoration only: hidden from assistive
 * technology, out of the pointer's way, and fixed over the viewport, so
 * it moves nothing on the page. Each piece's place, delay, drift and spin
 * follow from its index, so it falls the same way every time. With motion
 * reduced it shows nothing at all: a piece at rest is transparent.
 */
export function Confetti() {
  return (
    <div class="confetti" aria-hidden="true">
      {Array.from({ length: PIECES }, (_, index) => (
        <span
          key={index}
          style={{
            "--x": `${(index * 37) % 100}%`,
            "--delay": `${(index % 8) * 0.09}s`,
            "--drift": `${((index * 13) % 9) - 4}rem`,
            "--spin": `${((index % 4) + 2) * 180}deg`,
          }}
        />
      ))}
    </div>
  );
}
