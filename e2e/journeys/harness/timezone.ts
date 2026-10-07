/**
 * A time zone in which `now` is about noon, for the browser: the app's
 * study day turns over in the early morning (preferences' day boundary),
 * so a journey run near that hour in the runner's zone could see its
 * study split over two days. Fixed-offset zones, as the IANA names them:
 * Etc/GMT-2 is two hours ahead of UTC.
 */
export function noonTimeZone(now: Date): string {
  const ahead = 12 - now.getUTCHours();
  if (ahead === 0) return "Etc/GMT";
  return `Etc/GMT${ahead > 0 ? "-" : "+"}${Math.abs(ahead)}`;
}
