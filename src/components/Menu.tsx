import {
  Fragment,
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import "./Menu.css";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  shortcut?: string;
  checked?: boolean;
  separator?: boolean;
}

type Point = { x: number; y: number };

function MenuSurface({
  id,
  label,
  items,
  point,
  last = false,
  trigger,
  onClose,
  onMove,
}: {
  id: string;
  label: string;
  items: MenuItem[];
  point: Point;
  last?: boolean;
  trigger: HTMLElement | null;
  onClose: (restoreFocus: boolean) => void;
  onMove?: (direction: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const topLayer = typeof HTMLElement.prototype.showPopover === "function";

  useLayoutEffect(() => {
    const menu = ref.current!;
    if (topLayer) menu.showPopover();
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - box.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(point.y, window.innerHeight - box.height - 8))}px`;
    const enabled = menu.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    ((last ? enabled[enabled.length - 1] : enabled[0]) ?? menu).focus();

    const dismiss = (event: Event) => {
      if (
        !menu.contains(event.target as Node) &&
        !trigger?.contains(event.target as Node)
      )
        onClose(false);
    };
    const reposition = (event: Event) => {
      if (!menu.contains(event.target as Node)) onClose(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      if (topLayer) menu.hidePopover();
    };
  }, [point.x, point.y, last, topLayer, trigger, onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ),
    );
    const index = enabled.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabled.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) %
              enabled.length;
      enabled[next]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose(true);
    } else if (event.key === "Tab") {
      onClose(true);
    } else if (
      onMove &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      event.stopPropagation();
      onMove(event.key === "ArrowRight" ? 1 : -1);
    }
  }

  return (
    <div
      ref={ref}
      id={id}
      className="custom-menu"
      role="menu"
      aria-label={label}
      tabIndex={-1}
      popover={topLayer ? "manual" : undefined}
      style={{ left: point.x, top: point.y }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <Fragment key={`${item.label}-${index}`}>
          {item.separator && index > 0 && (
            <div className="custom-menu__separator" role="separator" />
          )}
          <button
            type="button"
            className="custom-menu__item"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            disabled={item.disabled}
            tabIndex={-1}
            onClick={() => {
              onClose(true);
              item.onSelect();
            }}
          >
            <span className="custom-menu__check" aria-hidden="true">
              {item.checked ? "✓" : ""}
            </span>
            <span className="custom-menu__label">{item.label}</span>
            {item.shortcut && (
              <span className="custom-menu__shortcut">{item.shortcut}</span>
            )}
          </button>
        </Fragment>
      ))}
    </div>
  );
}

export function DropdownMenu({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [last, setLast] = useState(false);
  const [inMenubar, setInMenubar] = useState(false);

  useLayoutEffect(
    () => setInMenubar(!!trigger.current?.closest('[role="menubar"]')),
    [],
  );

  function open(focusLast = false) {
    const box = trigger.current!.getBoundingClientRect();
    setLast(focusLast);
    setPoint({ x: box.left, y: box.bottom + 5 });
  }
  const close = useCallback((restoreFocus: boolean) => {
    setPoint(null);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  function move(direction: number, reopen: boolean) {
    const bar = trigger.current?.closest('[role="menubar"]');
    const buttons = Array.from(
      bar?.querySelectorAll<HTMLButtonElement>("[data-menu-trigger]") ?? [],
    );
    if (!buttons.length) return;
    const next =
      buttons[
        (buttons.indexOf(trigger.current!) + direction + buttons.length) %
          buttons.length
      ];
    close(false);
    next.focus();
    if (reopen) next.click();
  }

  return (
    <div className="menu-trigger-wrap">
      <button
        ref={trigger}
        type="button"
        className={`menu-trigger ${point ? "is-open" : ""}`}
        role={inMenubar ? "menuitem" : undefined}
        data-menu-trigger=""
        aria-haspopup="menu"
        aria-expanded={!!point}
        aria-controls={point ? id : undefined}
        onClick={() => (point ? close(true) : open())}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open(event.key === "ArrowUp");
          } else if (
            inMenubar &&
            (event.key === "ArrowRight" || event.key === "ArrowLeft")
          ) {
            event.preventDefault();
            move(event.key === "ArrowRight" ? 1 : -1, !!point);
          }
        }}
      >
        {label}
      </button>
      {point && (
        <MenuSurface
          id={id}
          label={label}
          items={items}
          point={point}
          last={last}
          trigger={trigger.current}
          onClose={close}
          onMove={inMenubar ? (direction) => move(direction, true) : undefined}
        />
      )}
    </div>
  );
}

export function ContextMenu({
  children,
  items,
}: {
  children: ReactNode;
  items: MenuItem[];
}) {
  const id = useId();
  const [point, setPoint] = useState<Point | null>(null);
  const source = useRef<HTMLElement | null>(null);

  function nativeContext(target: EventTarget | null) {
    return (
      target instanceof Element &&
      !!target.closest(
        'input, textarea, [contenteditable]:not([contenteditable="false"]), dialog[open]',
      )
    );
  }
  const close = useCallback((restoreFocus: boolean) => {
    setPoint(null);
    if (restoreFocus) source.current?.focus();
  }, []);
  function open(target: EventTarget | null, next: Point) {
    source.current =
      target instanceof Element
        ? (target.closest<HTMLElement>("button, a[href], [tabindex]") ??
          (document.activeElement as HTMLElement))
        : (document.activeElement as HTMLElement);
    setPoint(next);
  }

  return (
    <div
      className="context-menu-target"
      onContextMenu={(event) => {
        if (event.defaultPrevented || nativeContext(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        open(event.target, { x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          nativeContext(event.target) ||
          !(
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          )
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const box = (event.target as Element).getBoundingClientRect();
        open(event.target, { x: box.left, y: box.bottom + 5 });
      }}
    >
      {children}
      {point && (
        <MenuSurface
          id={id}
          label="Context actions"
          items={items}
          point={point}
          trigger={null}
          onClose={close}
        />
      )}
    </div>
  );
}
