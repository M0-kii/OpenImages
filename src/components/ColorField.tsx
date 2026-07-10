import { fromHex, toHex, type Color } from "../lib/ops";

interface Props {
  label: string;
  value: Color;
  onChange: (c: Color) => void;
  /** Show an alpha slider. Off for tools where a translucent fill makes no sense. */
  alpha?: boolean;
}

export function ColorField({ label, value, onChange, alpha = false }: Props) {
  return (
    <div className="colorfield">
      <span className="label">{label}</span>
      <div className="colorfield__row">
        <label className="colorfield__well" style={{ background: toHex(value) }}>
          <input
            type="color"
            value={toHex(value)}
            // The native picker has no alpha, so preserve whatever we already had.
            onChange={(e) => onChange(fromHex(e.target.value, value.a))}
            aria-label={label}
          />
        </label>
        <input
          className="colorfield__hex"
          value={toHex(value).toUpperCase()}
          spellCheck={false}
          onChange={(e) => {
            const t = e.target.value.trim();
            if (/^#?[0-9a-f]{6}$/i.test(t)) onChange(fromHex(t, value.a));
          }}
        />
      </div>
      {alpha && (
        <input
          type="range"
          min={0}
          max={255}
          value={value.a}
          style={{ ["--pct" as string]: `${(value.a / 255) * 100}%` }}
          onChange={(e) => onChange({ ...value, a: Number(e.target.value) })}
          aria-label={`${label} alpha`}
        />
      )}
    </div>
  );
}
