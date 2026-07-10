import { useEffect, useRef, useState } from "react";
import { renderPreview } from "../lib/api";
import type { Operation } from "../lib/ops";

interface Preview {
  url: string | null;
  rendering: boolean;
  error: string | null;
}

/**
 * Re-renders the preview whenever the pipeline changes, debounced so a slider
 * drag doesn't queue one render per pixel of mouse travel.
 */
export function usePreview(id: number | null, ops: Operation[], debounceMs = 70): Preview {
  const [url, setUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Renders are async and can land out of order — a cheap grayscale toggle may
  // finish before the heavy blur queued ahead of it. Only the newest wins.
  const latest = useRef(0);
  const objectUrl = useRef<string | null>(null);
  const serialized = JSON.stringify(ops);

  useEffect(() => {
    if (id === null) {
      setUrl(null);
      return;
    }

    const seq = ++latest.current;
    setRendering(true);

    const timer = setTimeout(async () => {
      try {
        const blob = await renderPreview(id, JSON.parse(serialized) as Operation[]);
        if (seq !== latest.current) return;

        const next = URL.createObjectURL(blob);
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = next;

        setUrl(next);
        setError(null);
      } catch (e) {
        if (seq === latest.current) setError(String(e));
      } finally {
        if (seq === latest.current) setRendering(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [id, serialized, debounceMs]);

  // Blob URLs pin their buffer in memory until revoked; a few hundred previews
  // of a large image adds up fast.
  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  return { url, rendering, error };
}
