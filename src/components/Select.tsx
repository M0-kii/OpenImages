import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import "./Select.css";

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<readonly [label: string, value: string]>;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  id,
  disabled,
  ...label
}: Props) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 160,
    maxHeight: 260,
  });
  const typed = useRef({ text: "", time: 0 });
  const selected = options.findIndex(([, option]) => option === value);

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  const choose = (index: number) => {
    if (options[index]) onChange(options[index][1]);
    close();
  };

  useEffect(() => {
    if (disabled || !options.length) setOpen(false);
  }, [disabled, options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current!;
    const trigger = triggerRef.current!;
    list.showPopover();
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const height = Math.min(list.scrollHeight, 260);
      const upward = below < height && above > below;
      const maxHeight = Math.max(40, Math.min(260, upward ? above : below));
      const width = Math.min(Math.max(160, rect.width), window.innerWidth - 16);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: upward
          ? rect.top - Math.min(height, maxHeight) - 5
          : rect.bottom + 5,
        width,
        maxHeight,
      });
    };
    const dismiss = (event: Event) => {
      if (
        !list.contains(event.target as Node) &&
        !trigger.contains(event.target as Node)
      )
        setOpen(false);
    };
    const toggle = (event: Event) => {
      if ((event as ToggleEvent).newState === "closed") setOpen(false);
    };
    place();
    list.focus();
    list.addEventListener("toggle", toggle);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      list.removeEventListener("toggle", toggle);
      list.hidePopover();
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (open)
      listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (disabled || !options.length) return;
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab" && open) {
      choose(active);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else {
        setActive(Math.max(0, selected));
        setOpen(true);
      }
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : open
              ? (active +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                options.length
              : Math.max(0, selected);
      setActive(index);
      setOpen(true);
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const time = Date.now();
      const text = `${time - typed.current.time < 500 ? typed.current.text : ""}${event.key.toLowerCase()}`;
      const index = options.findIndex(([name]) =>
        name.toLowerCase().startsWith(text),
      );
      typed.current = { text, time };
      if (index >= 0) {
        setActive(index);
        setOpen(true);
      }
    }
  };

  return (
    <div className="custom-select">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className="custom-select__trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || !options.length}
        {...label}
        onKeyDown={onKeyDown}
        onClick={() => {
          if (open) close();
          else {
            setActive(Math.max(0, selected));
            setOpen(true);
          }
        }}
      >
        <span>{options[selected]?.[0] ?? value}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          ref={listRef}
          id={listId}
          className="custom-select__list"
          popover="auto"
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${listId}-${active}`}
          {...label}
          style={position}
          onKeyDown={onKeyDown}
        >
          {options.map(([name, option], index) => (
            <div
              key={option}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option === value}
              className={`custom-select__option ${active === index ? "is-active" : ""}`}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{name}</span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ visibility: option === value ? "visible" : "hidden" }}
              >
                <path d="m3 8 3 3 7-7" />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
