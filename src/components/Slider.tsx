interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Double-clicking the row snaps back here. */
  reset?: number;
  suffix?: string;
}

export function Slider({
  label,
  value,
  onChange,
  min = -100,
  max = 100,
  step = 1,
  reset = 0,
  suffix = "",
}: Props) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div
      className="slider"
      onDoubleClick={() => onChange(reset)}
      title="Double-click to reset"
    >
      <div className="slider__head">
        <span className="label">{label}</span>
        <span className={`slider__val ${value !== reset ? "is-set" : ""}`}>
          {value > 0 && reset === 0 ? "+" : ""}
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--pct" as string]: `${pct}%` }}
        aria-label={label}
      />
    </div>
  );
}
