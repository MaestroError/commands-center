import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => readMediaQueryMatch(query));

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setMatches(false);
      return;
    }

    const mediaQuery = window.matchMedia(query);

    if (!mediaQuery) {
      setMatches(false);
      return;
    }

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handler);

    return () => mediaQuery.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

function readMediaQueryMatch(query: string): boolean {
  if (typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(query)?.matches ?? false;
}
