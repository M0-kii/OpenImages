import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OutputFormat } from "../lib/api";
import type { Color } from "../lib/ops";

export type Theme = "dark" | "light";

export interface Settings {
  theme: Theme;
  grain: boolean;
  reduceMotion: boolean;
  checkerboard: boolean;
  defaultFormat: OutputFormat;
  defaultQuality: number;
  /** Background that transparency is composited onto for formats without alpha. */
  matte: Color;
}

const DEFAULTS: Settings = {
  theme: "dark",
  grain: false,
  reduceMotion: false,
  checkerboard: true,
  defaultFormat: "png",
  defaultQuality: 90,
  matte: { r: 255, g: 255, b: 255, a: 255 },
};

const KEY = "openimages.settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    // Spread over defaults so a settings blob written by an older build — one
    // that predates a key we've since added — still boots.
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

interface Ctx {
  settings: Settings;
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  const set = useMemo(
    () =>
      <K extends keyof Settings>(key: K, value: Settings[K]) =>
        setSettings((s) => ({ ...s, [key]: value })),
    [],
  );

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));

    const root = document.documentElement;
    // One attribute flips the whole palette; every token is defined for both.
    root.dataset.theme = settings.theme;
    root.classList.toggle("no-grain", !settings.grain);
    root.classList.toggle("no-motion", settings.reduceMotion);
    root.classList.toggle("no-checker", !settings.checkerboard);
  }, [settings]);

  const value = useMemo(
    () => ({ settings, set, reset: () => setSettings(DEFAULTS) }),
    [settings, set],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>");
  return ctx;
}
