import { useEffect } from "react";

export function useShellGuards() {
  useEffect(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    const preventBrowserShortcuts = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (
        key === "f12" ||
        key === "contextmenu" ||
        (event.shiftKey && key === "f10") ||
        ((event.ctrlKey || event.metaKey) &&
          event.shiftKey &&
          ["i", "j", "c"].includes(key)) ||
        (event.metaKey && event.altKey && key === "i")
      ) {
        event.preventDefault();
      }
    };

    // Run after component handlers so custom menus retain their own behavior.
    window.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("keydown", preventBrowserShortcuts);
    return () => {
      window.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("keydown", preventBrowserShortcuts);
    };
  }, []);
}
