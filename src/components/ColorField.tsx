import { useEffect, useId, useRef, useState } from "react";
import { fromHex, toHex, type Color } from "../lib/ops";
import "./ColorField.css";

interface Props {
  label: string;
  value: Color;
  onChange: (c: Color) => void;
  /** Show an alpha slider. Off for tools where a translucent fill makes no sense. */
  alpha?: boolean;
}

export function ColorField({ label, value, onChange, alpha = false }: Props) {
  const hexId = useId();
  const pickerId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const picker = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hex, setHex] = useState(() => toHex(value).toUpperCase());
  const [error, setError] = useState(false);
  const [hue, setHue] = useState(() => toHsv(value)[0]);
  const [, saturation, brightness] = toHsv(value);

  useEffect(() => {
    setHex(toHex(value).toUpperCase());
    const [nextHue, nextSaturation] = toHsv(value);
    if (nextSaturation > 0) setHue(nextHue);
  }, [value.r, value.g, value.b]);

  useEffect(() => {
    const dismiss = (event: Event) => {
      if (
        event.type === "scroll" &&
        event.target instanceof Node &&
        picker.current?.contains(event.target)
      )
        return;
      picker.current?.hidePopover();
      setExpanded(false);
    };
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, []);

  const commitHex = () => {
    const valid = /^#?[0-9a-f]{6}$/i.test(hex.trim());
    if (valid) onChange(fromHex(hex.trim(), value.a));
    setHex(
      valid
        ? `#${hex.trim().replace("#", "").toUpperCase()}`
        : toHex(value).toUpperCase(),
    );
    setError(!valid);
  };

  const close = () => {
    picker.current?.hidePopover();
    setExpanded(false);
    trigger.current?.focus();
  };

  const toggle = () => {
    if (expanded) return close();
    const panel = picker.current;
    const button = trigger.current;
    if (!panel || !button) return;
    const rect = button.getBoundingClientRect();
    panel.showPopover();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    panel.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    panel.style.top = `${Math.max(12, rect.bottom + height + 8 < window.innerHeight ? rect.bottom + 8 : Math.min(rect.top - height - 8, window.innerHeight - height - 12))}px`;
    setExpanded(true);
    panel.querySelector<HTMLElement>("[data-color-surface]")?.focus();
  };

  const setPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    onChange(
      fromHsv(
        hue,
        clamp((event.clientX - rect.left) / rect.width),
        1 - clamp((event.clientY - rect.top) / rect.height),
        value.a,
      ),
    );
  };

  return (
    <div className="colorfield">
      <label className="label" htmlFor={hexId}>
        {label}
      </label>
      <div className="colorfield__row">
        <button
          ref={trigger}
          type="button"
          className="colorfield__well"
          style={{ background: toHex(value) }}
          onClick={toggle}
          aria-label={`Choose ${label.toLowerCase()} color`}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          aria-controls={pickerId}
        />
        <input
          className="colorfield__hex"
          id={hexId}
          value={hex}
          spellCheck={false}
          maxLength={7}
          aria-describedby={error ? `${hexId}-error` : undefined}
          onChange={(e) => {
            setHex(e.target.value);
            setError(false);
          }}
          onBlur={commitHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitHex();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setHex(toHex(value).toUpperCase());
              setError(false);
            }
          }}
        />
      </div>
      {error && (
        <p className="colorfield__error" id={`${hexId}-error`} role="alert">
          Enter a six-digit hex color.
        </p>
      )}
      <div
        ref={picker}
        id={pickerId}
        popover="auto"
        role="dialog"
        aria-label={`${label} color picker`}
        className="colorpicker"
        onToggle={(event) =>
          setExpanded((event.nativeEvent as ToggleEvent).newState === "open")
        }
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="colorpicker__header">
          <strong>{label}</strong>
          <button
            type="button"
            className="colorpicker__close"
            onClick={close}
            aria-label="Close color picker"
          >
            ×
          </button>
        </div>
        <div
          data-color-surface
          className="colorpicker__surface"
          style={{ backgroundColor: `hsl(${hue} 100% 50%)` }}
          role="group"
          aria-label="Saturation and brightness"
          aria-describedby={`${pickerId}-help`}
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setPoint(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              setPoint(event);
          }}
          onKeyDown={(event) => {
            if (!event.key.startsWith("Arrow")) return;
            event.preventDefault();
            const step = event.shiftKey ? 0.1 : 0.01;
            onChange(
              fromHsv(
                hue,
                clamp(
                  saturation +
                    (event.key === "ArrowRight"
                      ? step
                      : event.key === "ArrowLeft"
                        ? -step
                        : 0),
                ),
                clamp(
                  brightness +
                    (event.key === "ArrowUp"
                      ? step
                      : event.key === "ArrowDown"
                        ? -step
                        : 0),
                ),
                value.a,
              ),
            );
          }}
        >
          <span
            className="colorpicker__cursor"
            style={{
              left: `${saturation * 100}%`,
              top: `${(1 - brightness) * 100}%`,
            }}
          />
        </div>
        <p className="sr-only" id={`${pickerId}-help`}>
          Left and right change saturation. Up and down change brightness. Hold
          Shift for larger steps.
        </p>
        <label className="colorpicker__hue-label">
          <span>Hue</span>
          <span>{Math.round(hue)}°</span>
          <input
            className="colorpicker__hue"
            type="range"
            min={0}
            max={359}
            value={Math.round(hue)}
            onChange={(event) => {
              const next = Number(event.target.value);
              setHue(next);
              onChange(fromHsv(next, saturation, brightness, value.a));
            }}
          />
        </label>
        <div className="colorpicker__channels">
          {(["r", "g", "b"] as const).map((channel) => (
            <label key={channel}>
              <span>{channel.toUpperCase()}</span>
              <input
                aria-label={`${label} ${channel === "r" ? "red" : channel === "g" ? "green" : "blue"}`}
                type="number"
                min={0}
                max={255}
                value={value[channel]}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [channel]: Math.round(
                      Math.max(0, Math.min(255, Number(event.target.value))),
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>
      {alpha && (
        <label className="colorfield__alpha">
          <span>Opacity</span>
          <span>{Math.round((value.a / 255) * 100)}%</span>
          <input
            type="range"
            min={0}
            max={255}
            value={value.a}
            style={{ ["--pct" as string]: `${(value.a / 255) * 100}%` }}
            onChange={(e) => onChange({ ...value, a: Number(e.target.value) })}
            aria-label={`${label} alpha`}
          />
        </label>
      )}
    </div>
  );
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function toHsv({ r, g, b }: Color): [number, number, number] {
  const red = r / 255,
    green = g / 255,
    blue = b / 255;
  const max = Math.max(red, green, blue),
    min = Math.min(red, green, blue),
    delta = max - min;
  const hue =
    delta === 0
      ? 0
      : max === red
        ? ((green - blue) / delta) % 6
        : max === green
          ? (blue - red) / delta + 2
          : (red - green) / delta + 4;
  return [(hue * 60 + 360) % 360, max === 0 ? 0 : delta / max, max];
}

function fromHsv(
  hue: number,
  saturation: number,
  brightness: number,
  alpha: number,
): Color {
  const channel = (offset: number) => {
    const position = (offset + hue / 60) % 6;
    return Math.round(
      255 *
        brightness *
        (1 - saturation * Math.max(0, Math.min(position, 4 - position, 1))),
    );
  };
  return { r: channel(5), g: channel(3), b: channel(1), a: alpha };
}
