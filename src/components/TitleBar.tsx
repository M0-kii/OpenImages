import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DropdownMenu, type MenuItem } from "./Menu";
import { TabStrip, type Tab } from "./TabStrip";

interface Props {
  onHome: () => void;
  menus: { label: string; items: MenuItem[] }[];
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  reduceMotion: boolean;
}
export function TitleBar(p: Props) {
  const [maximized, setMaximized] = useState(false);
  const [win] = useState(getCurrentWindow);
  const [expanded, setExpanded] = useState(false);
  const [menuWidth, setMenuWidth] = useState(0);
  const menuId = useId();
  const menuRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const previousLeft = useRef<number | null>(null);
  const animation = useRef<Animation | null>(null);
  const instant = useRef(false);

  useLayoutEffect(() => {
    const measure = () => setMenuWidth(menuRef.current?.offsetWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    const from = previousLeft.current;
    previousLeft.current = null;
    if (
      !tabs ||
      from === null ||
      p.reduceMotion ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const offset = from - tabs.getBoundingClientRect().left;
    if (offset && tabs.animate) {
      animation.current = tabs.animate(
        [
          { transform: `translateX(${offset}px)` },
          { transform: "translateX(0)" },
        ],
        {
          duration: 240,
          easing:
            getComputedStyle(tabs).getPropertyValue("--ease").trim() ||
            "cubic-bezier(0.23, 1, 0.32, 1)",
        },
      );
    }
  }, [expanded, menuWidth, p.reduceMotion]);

  useEffect(() => {
    if (p.reduceMotion) animation.current?.cancel();
    return () => animation.current?.cancel();
  }, [p.reduceMotion]);

  const toggleMenu = (withMotion: boolean) => {
    instant.current = !withMotion;
    previousLeft.current = withMotion
      ? (tabsRef.current?.getBoundingClientRect().left ?? null)
      : null;
    animation.current?.cancel();
    setExpanded((current) => !current);
  };

  useEffect(() => {
    void win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(
      () => void win.isMaximized().then(setMaximized),
    );
    return () => void unlisten.then((f) => f());
  }, [win]);

  return (
    <header
      className="titlebar"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented && expanded) {
          e.preventDefault();
          toggleMenu(false);
          moreRef.current?.focus();
        }
      }}
    >
      {/* Only the inert strip carries the drag region. Putting it on the whole
          header would swallow clicks on the tabs and window buttons. */}
      <div className="titlebar__grip" data-tauri-drag-region />

      <div className="titlebar__brand">
        <button className="titlebar__mark" onClick={p.onHome} title="All tools">
          <img src="/logo.svg" alt="" width={25} height={25} />
          <span>OpenImages</span>
        </button>
        <button
          ref={moreRef}
          className="titlebar__more"
          aria-label={
            expanded ? "Hide application menu" : "Show application menu"
          }
          aria-expanded={expanded}
          aria-controls={menuId}
          onClick={(e) => toggleMenu(e.detail !== 0)}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.7" />
            <circle cx="12" cy="12" r="1.7" />
            <circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
      </div>

      <div
        className="titlebar__menu-slot"
        style={{ width: expanded ? menuWidth : 0 }}
      >
        <nav
          ref={menuRef}
          id={menuId}
          className={`menubar titlebar__menus ${expanded ? "is-expanded" : ""} ${instant.current ? "is-instant" : ""}`}
          role="menubar"
          aria-label="Application menu"
          aria-hidden={!expanded}
          inert={!expanded}
        >
          {p.menus.map((menu) => (
            <DropdownMenu
              key={`${menu.label}-${expanded}`}
              label={menu.label}
              items={menu.items}
            />
          ))}
        </nav>
      </div>

      <div className="titlebar__tabs" ref={tabsRef}>
        <TabStrip
          tabs={p.tabs}
          activeId={p.activeId}
          onSelect={p.onSelect}
          onClose={p.onClose}
        />
      </div>

      <div className="titlebar__spacer" data-tauri-drag-region />

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
