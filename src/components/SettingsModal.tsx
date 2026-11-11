import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { version } from "../../package.json";
import { ColorField } from "./ColorField";
import { Select } from "./Select";
import { ToolIcon } from "./ToolIcon";
import { useSettings, type Theme } from "../state/settings";
import { TOOLS } from "../tools/registry";
import type { OutputFormat } from "../lib/api";
import "./SettingsModal.css";

type Pane = "appearance" | "canvas" | "export" | "about";
const REPOSITORY = "https://github.com/M0-kii/OpenImages";
const PANES = [
  ["appearance", "Appearance", "adjust"],
  ["canvas", "Canvas", "image"],
  ["export", "Export", "convert"],
  ["about", "About", "home"],
] as const;

export function SettingsModal({
  onClose,
  formats,
}: {
  onClose: () => void;
  formats: OutputFormat[];
}) {
  const { settings, set, reset } = useSettings();
  const [pane, setPane] = useState<Pane>("appearance");
  const [linkError, setLinkError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function openLink(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setLinkError(false);
    try {
      await openUrl(event.currentTarget.href);
    } catch {
      setLinkError(true);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="settings-dialog"
      aria-label="Settings"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="settings-scrim" onClick={onClose} />
      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          <div className="settings-nav__title">Settings</div>
          <div className="settings-nav__items">
            {PANES.map(([id, label, icon]) => (
              <button
                key={id}
                className={`settings-nav__item ${pane === id ? "is-active" : ""}`}
                aria-pressed={pane === id}
                onClick={() => setPane(id)}
              >
                <ToolIcon name={icon} size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <div className="settings-nav__footer">
            <button className="settings-reset" onClick={reset}>
              Restore defaults
            </button>
            <a className="settings-github" href={REPOSITORY} onClick={openLink}>
              <GitHubIcon />
              <span>GitHub</span>
              <ExternalIcon />
            </a>
          </div>
        </nav>
        <div className="settings-content">
          <button
            className="settings-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <ToolIcon name="close" size={17} />
          </button>
          {pane === "appearance" && (
            <>
              <PaneHead
                title="Appearance"
                blurb="Set the tone of your workspace."
              />
              <section
                className="settings-section"
                aria-labelledby="settings-theme-heading"
              >
                <h3 id="settings-theme-heading">Theme</h3>
                <div
                  className="settings-themes"
                  role="group"
                  aria-label="Theme"
                >
                  {(
                    [
                      ["dark", "Dark"],
                      ["light", "Light"],
                    ] as [Theme, string][]
                  ).map(([theme, label]) => (
                    <button
                      key={theme}
                      className={`settings-theme ${settings.theme === theme ? "is-active" : ""}`}
                      aria-pressed={settings.theme === theme}
                      onClick={() => set("theme", theme)}
                    >
                      <span
                        className={`settings-theme__preview settings-theme__preview--${theme}`}
                        aria-hidden="true"
                      />
                      {label}
                      <span className="settings-theme__check" aria-hidden="true">
                        {settings.theme === theme ? "✓" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              <section
                className="settings-section"
                aria-labelledby="settings-interface-heading"
              >
                <h3 id="settings-interface-heading">Interface</h3>
                <Toggle
                  label="Film grain"
                  hint="Add a subtle texture to the interface."
                  value={settings.grain}
                  onChange={(value) => set("grain", value)}
                />
                <Toggle
                  label="Reduce motion"
                  hint="Keep menus and controls still."
                  value={settings.reduceMotion}
                  onChange={(value) => set("reduceMotion", value)}
                />
              </section>
            </>
          )}
          {pane === "canvas" && (
            <>
              <PaneHead
                title="Canvas"
                blurb="Choose how your image is displayed while you edit."
              />
              <section
                className="settings-section"
                aria-labelledby="settings-preview-heading"
              >
                <h3 id="settings-preview-heading">Preview</h3>
                <Toggle
                  label="Transparency checkerboard"
                  hint="Distinguish transparent pixels from the image."
                  value={settings.checkerboard}
                  onChange={(value) => set("checkerboard", value)}
                />
                <div className="settings-preview-example">
                  <span
                    className={settings.checkerboard ? "is-checkered" : ""}
                    aria-hidden="true"
                  >
                    <ToolIcon name="image" size={26} />
                  </span>
                  <p className="settings-hint">
                    Previews use a smaller copy for responsive editing. Exports
                    use your full-resolution source.
                  </p>
                </div>
              </section>
            </>
          )}
          {pane === "export" && (
            <>
              <PaneHead
                title="Export"
                blurb="Choose the starting settings for your next image."
              />
              <section
                className="settings-section"
                aria-labelledby="settings-output-heading"
              >
                <h3 id="settings-output-heading">Image output</h3>
                <div className="settings-field settings-field--inline">
                  <label htmlFor="default-format">Default format</label>
                  <Select
                    id="default-format"
                    aria-label="Default format"
                    value={settings.defaultFormat}
                    onChange={(value) =>
                      set("defaultFormat", value as OutputFormat)
                    }
                    options={formats.map(
                      (format) => [format.toUpperCase(), format] as const,
                    )}
                  />
                </div>
                <div className="settings-field">
                  <div className="settings-field__head">
                    <label htmlFor="default-quality">Default JPEG quality</label>
                    <output htmlFor="default-quality">
                      {settings.defaultQuality}%
                    </output>
                  </div>
                  <input
                    id="default-quality"
                    type="range"
                    min={1}
                    max={100}
                    value={settings.defaultQuality}
                    style={{
                      ["--pct" as string]: `${settings.defaultQuality}%`,
                    }}
                    onChange={(event) =>
                      set("defaultQuality", Number(event.target.value))
                    }
                  />
                  <p className="settings-hint">
                    Higher quality keeps more detail and produces larger files.
                  </p>
                </div>
              </section>
              <section
                className="settings-section"
                aria-labelledby="settings-transparency-heading"
              >
                <h3 id="settings-transparency-heading">Transparency</h3>
                <div className="settings-field">
                  <ColorField
                    label="Matte for opaque formats"
                    value={settings.matte}
                    onChange={(value) => set("matte", value)}
                  />
                  <p className="settings-hint">
                    JPEG replaces transparent pixels with this background color.
                  </p>
                </div>
              </section>
            </>
          )}
          {pane === "about" && (
            <>
              <PaneHead
                title="About"
                blurb="A toolkit for everyday image editing."
              />
              <div className="settings-about__brand">
                <img
                  src="/logo.svg"
                  alt="OpenImages logo"
                  width={72}
                  height={72}
                />
                <div>
                  <h3>OpenImages</h3>
                  <p>Crop, resize, adjust, and export.</p>
                </div>
              </div>
              <dl className="settings-about__details">
                <div>
                  <dt>Version</dt>
                  <dd>{version}</dd>
                </div>
                <div>
                  <dt>Creator</dt>
                  <dd>
                    <a href="https://github.com/M0-kii" onClick={openLink}>
                      M0-kii
                      <ExternalIcon />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>License</dt>
                  <dd>Not specified</dd>
                </div>
                <div>
                  <dt>Available tools</dt>
                  <dd>{TOOLS.length}</dd>
                </div>
                <div>
                  <dt>Repository</dt>
                  <dd>
                    <a href={REPOSITORY} onClick={openLink}>
                      M0-kii / OpenImages
                      <ExternalIcon />
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>Export formats</dt>
                  <dd>
                    {formats.map((format) => format.toUpperCase()).join(" · ")}
                  </dd>
                </div>
              </dl>
            </>
          )}
          {linkError && (
            <p className="settings-link-error" role="alert">
              Could not open the link. Please try again.
            </p>
          )}
        </div>
      </div>
    </dialog>
  );
}

function PaneHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <header className="settings-heading">
      <h2>{title}</h2>
      <p>{blurb}</p>
    </header>
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
  onChange: (value: boolean) => void;
}) {
  const hintId = useId();
  return (
    <div className="settings-row">
      <div>
        <span className="settings-row__label">{label}</span>
        <p id={hintId}>{hint}</p>
      </div>
      <button
        role="switch"
        aria-label={label}
        aria-describedby={hintId}
        aria-checked={value}
        className={`switch ${value ? "is-on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span className="switch__knob" />
      </button>
    </div>
  );
}

function ExternalIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 4h6v6m0-6L10 14M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.86c-2.78.6-3.37-1.18-3.37-1.18-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.64.35-1.08.64-1.33-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03A9.6 9.6 0 0 1 12 6.84c.85 0 1.71.11 2.51.34 1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.58 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
