import { useEffect, useState } from "react";

/**
 * Trailing-edge debounce. The palette and data-URI panels re-encode the image on
 * every change; without this, dragging a slider from 2 to 16 fires fourteen full
 * round-trips to Rust.
 */
export function useDebounced<T>(value: T, ms = 180): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);

  return settled;
}
