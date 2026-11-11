import { useState } from "react";
import { MAX_BATCH_EDGE, type useBatchQueue } from "../hooks/useBatchQueue";
import type { DocMeta, OutputFormat } from "../lib/api";
import { buildOps, type EditState } from "../lib/ops";
import { Select } from "./Select";
import { ToolIcon } from "./ToolIcon";
import "./BatchWorkspace.css";

const RESIZE_MODES = [
  ["Keep size", "keep"],
  ["Fit within", "fit"],
  ["Exact size", "exact"],
] as const;

const STATUS = {
  queued: "Queued",
  writing: "Exporting",
  written: "Written",
  failed: "Failed",
};

interface Props {
  batch: ReturnType<typeof useBatchQueue>;
  formats: OutputFormat[];
  doc: Pick<DocMeta, "id" | "name"> | null;
  edit: EditState;
}

export function BatchWorkspace({ batch, formats, doc, edit }: Props) {
  const [presetName, setPresetName] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("");
  const { entries, options, running } = batch;
  const written = entries.filter((item) => item.status === "written").length;
  const failed = entries.filter((item) => item.status === "failed").length;
  const applyEdits = doc !== null && batch.editsDocId === doc.id;
  const validationError = batch.validationError ??
    (formats.includes(options.format) ? null : "Choose an available output format.");

  function setOption<K extends keyof typeof options>(key: K, value: typeof options[K]) {
    batch.setOptions((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="workspace batch-workspace">
      <section className="workspace__canvas batch-queue" aria-labelledby="batch-title">
        <header className="panel__head">
          <span className="panel__icon">
            <ToolIcon name="batch" size={22} />
          </span>
          <div>
            <h1 id="batch-title">Batch Export</h1>
            <p>Resize or convert a group of images in one run.</p>
          </div>
        </header>
        <div className="batch-toolbar">
          <button className="btn" disabled={running} onClick={() => void batch.pickFiles()}>
            Add images…
          </button>
          <button className="btn btn--ghost" disabled={running || !entries.length} onClick={batch.clear}>
            Clear list
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="batch-empty">
            <ToolIcon name="batch" size={28} />
            <strong>Drop images here</strong>
            <p>Or choose files with Add images.</p>
          </div>
        ) : (
          <ul className="batch-files" aria-label="Batch queue">
            {entries.map(({ path, status, message }) => {
              const name = path.split(/[\\/]/).pop() || path;
              return (
                <li key={path}>
                  <div className="batch-file__detail">
                    <span className="truncate" title={path}>{name}</span>
                    <span className="batch-file__folder truncate" title={path}>
                      {path.slice(0, path.length - name.length)}
                    </span>
                    {message && <span className="batch-file__message">{message}</span>}
                  </div>
                  <span className={"batch-file__status batch-file__status--" + status}>
                    {STATUS[status]}
                  </span>
                  <button
                    className="btn btn--ghost"
                    disabled={running}
                    onClick={() => batch.removeFile(path)}
                    aria-label={"Remove " + name}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="panel" aria-label="Batch settings">
        <section className="group">
          <h2 className="group__title">Output</h2>
          <div className="field">
            <label className="label" htmlFor="batch-format">Format</label>
            <Select
              id="batch-format"
              value={options.format}
              options={formats.map((format) => [format.toUpperCase(), format])}
              onChange={(value) => setOption("format", value as OutputFormat)}
              disabled={running}
            />
          </div>
          {options.format === "jpeg" && (
            <label className="numfield batch-field">
              <span className="label">JPEG quality</span>
              <input
                type="number"
                min={1}
                max={100}
                disabled={running}
                value={options.quality || ""}
                onChange={(event) => setOption("quality", event.target.valueAsNumber || 0)}
              />
            </label>
          )}
          <label className="numfield batch-field">
            <span className="label">Filename suffix</span>
            <input
              type="text"
              spellCheck={false}
              disabled={running}
              value={options.suffix}
              onChange={(event) => setOption("suffix", event.target.value)}
            />
          </label>
          <p className="note">Existing files are skipped.</p>
        </section>

        <section className="group">
          <h2 className="group__title">Resize</h2>
          <Select
            aria-label="Resize mode"
            value={options.resizeMode}
            options={RESIZE_MODES}
            onChange={(value) => setOption("resizeMode", value as typeof options.resizeMode)}
            disabled={running}
          />
          {options.resizeMode !== "keep" && (
            <>
              <div className="row row--dims batch-dimensions">
                {(["width", "height"] as const).map((axis) => (
                  <label className="numfield" key={axis}>
                    <span className="label">{axis === "width" ? "Width" : "Height"} (px)</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_BATCH_EDGE}
                      disabled={running}
                      value={options[axis] || ""}
                      onChange={(event) => setOption(axis, event.target.valueAsNumber || 0)}
                    />
                  </label>
                ))}
              </div>
              <p className="note">
                {options.resizeMode === "fit"
                  ? "Preserves each image’s proportions and leaves smaller images at their original size."
                  : "Scales each image to these dimensions, which may change its proportions."}
              </p>
            </>
          )}
          {doc && (
            <label className="batch-apply-edits">
              <input
                type="checkbox"
                checked={applyEdits}
                disabled={running}
                onChange={(event) => batch.setEditsDocId(event.target.checked ? doc.id : null)}
              />
              <span>Use edits from <strong>{doc.name}</strong> before resizing</span>
            </label>
          )}
        </section>

        <section className="group">
          <h2 className="group__title">Presets</h2>
          {batch.presets.length > 0 && (
            <div className="row batch-preset">
              <Select
                aria-label="Saved preset"
                value={selectedPreset}
                options={[["Choose preset", ""], ...batch.presets.map(({ name }) => [name, name] as const)]}
                onChange={(value) => {
                  setSelectedPreset(value);
                  batch.applyPreset(value);
                }}
                disabled={running}
              />
              <button
                className="btn btn--ghost"
                disabled={running || !selectedPreset}
                onClick={() => {
                  batch.deletePreset(selectedPreset);
                  setSelectedPreset("");
                }}
              >
                Delete
              </button>
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (batch.savePreset(presetName)) {
                setSelectedPreset(presetName.trim());
                setPresetName("");
              }
            }}
          >
            <label className="numfield batch-field">
              <span className="label">Preset name</span>
              <input
                type="text"
                value={presetName}
                maxLength={48}
                disabled={running}
                onChange={(event) => setPresetName(event.target.value)}
              />
            </label>
            <button type="submit" className="btn" disabled={running || !!validationError || !presetName.trim()}>
              Save preset
            </button>
          </form>
          <p className="note batch-preset-note">Saves resize and output settings on this device.</p>
        </section>
      </aside>

      <footer className="exportbar batch-footer">
        <div className="batch-progress">
          <p className="note" role="status">
            {entries.length} {entries.length === 1 ? "image" : "images"} · {written} written · {failed} failed
          </p>
          {running && <progress aria-label="Batch progress" value={written + failed} max={entries.length} />}
          {(batch.error || validationError) && <p className="note" role="alert">{batch.error ?? validationError}</p>}
        </div>
        {running ? (
          <button className="btn" disabled={batch.stopping} onClick={batch.stop}>
            {batch.stopping ? "Stopping…" : "Stop after current file"}
          </button>
        ) : (
          <button
            className="btn btn--primary"
            disabled={!entries.length || !!validationError}
            onClick={() => void batch.run(applyEdits ? buildOps(edit) : [])}
          >
            Choose folder &amp; export
          </button>
        )}
      </footer>
    </div>
  );
}
