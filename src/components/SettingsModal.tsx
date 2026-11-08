import { useEffect, useRef, useState } from "react";
import { ColorField } from "./ColorField";
import { Select } from "./Select";
import { useSettings, type Theme } from "../state/settings";
import type { OutputFormat } from "../lib/api";

type Pane = "appearance" | "canvas" | "export" | "about";

const PANES: [Pane, string][] = [
  ["appearance", "Appearance"],
  ["canvas", "Canvas"],
  ["export", "Export"],
  ["about", "About"],
];

export function SettingsModal({
  onClose,
  formats,
}: {
  onClose: () => void;
  formats: OutputFormat[];
}) {
  const { settings, set, reset } = useSettings();
  const [pane, setPane] = useState<Pane>("appearance");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-label="Settings"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal__scrim" onClick={onClose} />

      <div className="modal__shell">
        <nav className="modal__nav">
          <span className="modal__navtitle">Settings</span>
          {PANES.map(([id, label]) => (
            <button
              key={id}
              className={`modal__navbtn ${pane === id ? "is-active" : ""}`}
              onClick={() => setPane(id)}
              aria-pressed={pane === id}
            >
              {label}
            </button>
          ))}
          <div className="modal__navfoot">
            <button className="btn btn--ghost" onClick={reset}>
              Restore defaults
            </button>
          </div>
        </nav>

        <div className="modal__body">
          <button
            className="modal__close"
            onClick={onClose}
            aria-label="Close settings"
          >
            <svg viewBox="0 0 12 12" aria-hidden>
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
            <span>ESC</span>
          </button>

          <div className="modal__pane" key={pane}>
            {pane === "appearance" && (
              <>
                <PaneHead title="Appearance" blurb="Theme and motion." />
                <Field label="Theme">
                  <div className="themepick" role="group" aria-label="Theme">
                    {(
                      [
                        ["dark", "Dark", "#232326"],
                        ["light", "Light", "#f8f9fc"],
                      ] as [Theme, string, string][]
                    ).map(([id, label, chip]) => (
                      <button
                        key={id}
                        className={`themepick__btn ${settings.theme === id ? "is-on" : ""}`}
                        onClick={() => set("theme", id)}
                        aria-pressed={settings.theme === id}
                      >
                        <span
                          className="themepick__chip"
                          style={{ background: chip }}
                        />
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Toggle
                  label="Film grain"
                  hint="A subtle texture across the interface."
                  value={settings.grain}
                  onChange={(v) => set("grain", v)}
                />
                <Toggle
                  label="Reduce motion"
                  hint="Disables interface transitions."
                  value={settings.reduceMotion}
                  onChange={(v) => set("reduceMotion", v)}
                />
              </>
            )}

            {pane === "canvas" && (
              <>
                <PaneHead
                  title="Canvas"
                  blurb="How the preview surface is drawn."
                />
                <Toggle
                  label="Transparency checkerboard"
                  hint="Show a checkered background behind transparent pixels."
                  value={settings.checkerboard}
                  onChange={(v) => set("checkerboard", v)}
                />
                <p className="note">
                  Previews render against a 1600px proxy so slider drags stay
                  smooth. Exports always use the full-resolution source.
                </p>
              </>
            )}

            {pane === "export" && (
              <>
                <PaneHead
                  title="Export"
                  blurb="Defaults for newly opened tools."
                />
                <Field label="Default format" id="default-format">
                  <Select
                    id="default-format"
                    aria-label="Default format"
                    value={settings.defaultFormat}
                    onChange={(value) =>
                      set("defaultFormat", value as OutputFormat)
                    }
                    options={formats.map((f) => [f.toUpperCase(), f] as const)}
                  />
                </Field>
                <Field
                  label={`Default JPEG quality: ${settings.defaultQuality}`}
                  id="default-quality"
                >
                  <input
                    id="default-quality"
                    type="range"
                    min={1}
                    max={100}
                    value={settings.defaultQuality}
                    style={{
                      ["--pct" as string]: `${settings.defaultQuality}%`,
                    }}
                    onChange={(e) =>
                      set("defaultQuality", Number(e.target.value))
                    }
                  />
                </Field>
                <div className="setrow">
                  <ColorField
                    label="Matte for opaque formats"
                    value={settings.matte}
                    onChange={(c) => set("matte", c)}
                  />
                  <p className="note">
                    JPEG has no alpha channel. Transparent pixels are composited
                    onto this color before saving.
                  </p>
                </div>
              </>
            )}

            {pane === "about" && (
              <>
                <PaneHead title="About" blurb="What this is." />
                <dl className="readout readout--stack">
                  <div>
                    <dt>Version</dt>
                    <dd>0.1.0</dd>
                  </div>
                  <div>
                    <dt>Shell</dt>
                    <dd>Tauri 2 · React · TypeScript</dd>
                  </div>
                  <div>
                    <dt>Pixels</dt>
                    <dd>Rust · image 0.25</dd>
                  </div>
                </dl>
                <p className="note">
                  Every operation runs locally. No image ever leaves this
                  machine.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

function PaneHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="panehead">
      <h2>{title}</h2>
      <p>{blurb}</p>
    </header>
  );
}

function Field({
  label,
  id,
  children,
}: {
  label: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setrow">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="setrow setrow--toggle">
      <div>
        <div className="setrow__label">{label}</div>
        <div className="setrow__hint">{hint}</div>
      </div>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={`switch ${value ? "is-on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}
