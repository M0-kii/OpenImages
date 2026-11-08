import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DropdownMenu, type MenuItem } from "./Menu";
import { ToolIcon } from "./ToolIcon";
import { useSettings } from "../state/settings";
import logo from "../../src-tauri/icons/128x128.png";

interface Props {
  onHome: () => void;
  onSettings: () => void;
  menus: { label: string; items: MenuItem[] }[];
}
export function TitleBar(p: Props) {
  const { settings, set } = useSettings();
  const [maximized, setMaximized] = useState(false);
  const [win] = useState(getCurrentWindow);

  useEffect(() => {
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(
      () => void win.isMaximized().then(setMaximized),
    );
    return () => void unlisten.then((f) => f());
  }, [win]);

  return (
    <header className="titlebar">
      {/* Only the inert strip carries the drag region. Putting it on the whole
          header would swallow clicks on the tabs and window buttons. */}
      <div className="titlebar__grip" data-tauri-drag-region />

      <button className="titlebar__mark" onClick={p.onHome} title="All tools">
        <img src={logo} alt="" width={25} height={25} />
        <span>OpenImages</span>
      </button>

      <nav className="menubar" role="menubar" aria-label="Application menu">
        {p.menus.map((menu) => (
          <DropdownMenu
            key={menu.label}
            label={menu.label}
            items={menu.items}
          />
        ))}
      </nav>

      <div className="titlebar__spacer" data-tauri-drag-region />

      <button
        className="theme-button"
        onClick={() =>
          set("theme", settings.theme === "dark" ? "light" : "dark")
        }
        title={`Switch to ${settings.theme === "dark" ? "light" : "dark"} theme`}
        aria-label={`Switch to ${settings.theme === "dark" ? "light" : "dark"} theme`}
      >
        <ToolIcon name={settings.theme === "dark" ? "moon" : "sun"} size={17} />
        <span>Theme</span>
      </button>

      <button
        className="iconbtn titlebar__settings"
        onClick={p.onSettings}
        title="Settings"
        aria-label="Settings"
      >
        <ToolIcon name="settings" size={18} />
      </button>

      <div className="wincontrols">
        <button
          className="wincontrols__btn"
          onClick={() => void win.minimize()}
          aria-label="Minimize"
        >
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
