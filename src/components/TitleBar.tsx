import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TabStrip, type Tab } from "./TabStrip";

interface Props {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onHome: () => void;
  onSettings: () => void;
}

export function TitleBar(p: Props) {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => void win.isMaximized().then(setMaximized));
    return () => void unlisten.then((f) => f());
  }, [win]);

  return (
    <header className="titlebar">
      {/* Only the inert strip carries the drag region. Putting it on the whole
          header would swallow clicks on the tabs and window buttons. */}
      <div className="titlebar__grip" data-tauri-drag-region />

      <button className="titlebar__mark" onClick={p.onHome} title="Home">
        <span className="dot" />
      </button>

      <TabStrip tabs={p.tabs} activeId={p.activeId} onSelect={p.onSelect} onClose={p.onClose} />

      <div className="titlebar__spacer" data-tauri-drag-region />

      <button className="iconbtn" onClick={p.onSettings} title="Settings" aria-label="Settings">
        <Gear />
      </button>

      <div className="wincontrols">
        <button className="wincontrols__btn" onClick={() => void win.minimize()} aria-label="Minimize">
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M0 5h10" />
          </svg>
        </button>
        <button
          className="wincontrols__btn"
          onClick={() => void win.toggleMaximize()}
          aria-label={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? (
            <svg viewBox="0 0 10 10" aria-hidden>
              <path d="M2.5 2.5h5v5h-5z" />
              <path d="M0.5 7.5v-7h7" />
            </svg>
          ) : (
            <svg viewBox="0 0 10 10" aria-hidden>
              <path d="M0.5 0.5h9v9h-9z" />
            </svg>
          )}
        </button>
        <button
          className="wincontrols__btn wincontrols__btn--close"
          onClick={() => void win.close()}
          aria-label="Close"
        >
          <svg viewBox="0 0 10 10" aria-hidden>
            <path d="M0 0l10 10M10 0L0 10" />
          </svg>
        </button>
      </div>
    </header>
  );
}

function Gear() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="2.4" />
      <path d="M8 1.3v1.6M8 13.1v1.6M14.7 8h-1.6M2.9 8H1.3M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4L3.3 3.3" />
    </svg>
  );
}
