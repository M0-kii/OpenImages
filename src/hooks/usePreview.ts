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
  const [frame, setFrame] = useState<{ id: number; url: string } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objectUrl = useRef<string | null>(null);
  const serialized = JSON.stringify(ops);

  useEffect(() => {
    setError(null);
    setRendering(id !== null);
    if (id === null) {
      setFrame(null);
      return;
    }

    let current = true;

    const timer = setTimeout(async () => {
      try {
        const blob = await renderPreview(id, JSON.parse(serialized) as Operation[]);
        if (!current) return;

        const next = URL.createObjectURL(blob);
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = next;

        setFrame({ id, url: next });
      } catch (e) {
        if (current) setError(String(e));
      } finally {
        if (current) setRendering(false);
      }
    }, debounceMs);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [id, serialized, debounceMs]);

  // Blob URLs pin their buffer in memory until revoked; a few hundred previews
  // of a large image adds up fast.
  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [id]);

  return { url: frame?.id === id ? frame.url : null, rendering, error };
}
