import { useEffect, useState } from "preact/hooks";

/** Whether the screen is as narrow as `query` says (NARROW, MEDIUM in workspaceLayout.ts), as it changes. */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setMatches(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return matches;
}
