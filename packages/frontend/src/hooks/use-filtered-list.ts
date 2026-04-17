import { useState, useCallback, useEffect, useMemo, useRef } from "react";

interface UseFilteredListOptions<T> {
  items: T[] | ((query: string) => Promise<T[]>);
  filterKey: keyof T;
  onSelect: (item: T) => void;
  onClose?: () => void;
}

interface UseFilteredListReturn<T> {
  query: string;
  setQuery: (query: string) => void;
  filtered: T[];
  isLoading: boolean;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  onKeyDown: (e: React.KeyboardEvent) => boolean;
  selectActive: () => void;
}

export function useFilteredList<T>(options: UseFilteredListOptions<T>): UseFilteredListReturn<T> {
  const { items, filterKey, onSelect, onClose } = options;

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [asyncItems, setAsyncItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const isAsyncItems = typeof items === "function";
  const fetchIdRef = useRef(0);
  const itemsFnRef = useRef(items);
  itemsFnRef.current = items;

  // Handle async items loading
  useEffect(() => {
    if (!isAsyncItems) return;

    const fetchId = ++fetchIdRef.current;
    setIsLoading(true);

    void (async () => {
      try {
        const fn = itemsFnRef.current;
        if (typeof fn !== "function") return;
        const result = await fn(query);
        // Only update if this is still the latest fetch
        if (fetchId === fetchIdRef.current) {
          setAsyncItems(result);
          setActiveIndex(0);
        }
      } catch {
        if (fetchId === fetchIdRef.current) {
          setAsyncItems([]);
        }
      } finally {
        if (fetchId === fetchIdRef.current) {
          setIsLoading(false);
        }
      }
    })();
  }, [query, isAsyncItems]);

  // Filter static items
  const filtered = useMemo(() => {
    if (isAsyncItems) {
      return asyncItems;
    }

    // At this point, items must be T[] since isAsyncItems is false
    const staticItems = items;
    if (typeof staticItems === "function") {
      return []; // Should never happen, but satisfies type narrowing
    }
    if (!query.trim()) {
      return staticItems;
    }

    const lowerQuery = query.toLowerCase();
    return staticItems.filter((item) => {
      const value = item[filterKey];
      if (typeof value === "string") {
        return value.toLowerCase().includes(lowerQuery);
      }
      return false;
    });
  }, [items, filterKey, query, isAsyncItems, asyncItems]);

  // Reset active index when filtered list changes
  useEffect(() => {
    if (!isAsyncItems) {
      setActiveIndex(0);
    }
  }, [filtered.length, isAsyncItems]);

  const selectActive = useCallback(() => {
    if (filtered.length > 0 && activeIndex >= 0 && activeIndex < filtered.length) {
      const item = filtered[activeIndex];
      if (item !== undefined) onSelect(item);
    }
  }, [filtered, activeIndex, onSelect]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
          return true;

        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
          return true;

        case "Enter":
          if (filtered.length > 0) {
            e.preventDefault();
            selectActive();
            return true;
          }
          return false;

        case "Escape":
          e.preventDefault();
          onClose?.();
          return true;

        case "Tab":
          // Tab also selects (common popover pattern)
          if (filtered.length > 0) {
            e.preventDefault();
            selectActive();
            return true;
          }
          return false;

        default:
          return false;
      }
    },
    [filtered, selectActive, onClose],
  );

  return {
    query,
    setQuery,
    filtered,
    isLoading,
    activeIndex,
    setActiveIndex,
    onKeyDown,
    selectActive,
  };
}
