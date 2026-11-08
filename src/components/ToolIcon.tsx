import type { ReactNode } from "react";
import type { ToolId } from "../tools/registry";

type IconName =
  | ToolId
  | "all"
  | "image"
  | "search"
  | "settings"
  | "upload"
  | "close"
  | "local"
  | "chevron"
  | "home";

const icons: Record<IconName, ReactNode> = {
  all: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m3 17 5-5 4 4 4-6 5 7" />
    </>
  ),
  crop: <path d="M7 3v12a2 2 0 0 0 2 2h12M3 7h12a2 2 0 0 1 2 2v12" />,
  resize: (
    <>
      <rect x="4" y="8" width="12" height="12" rx="2" />
      <path d="M14 3h7v7M21 3l-9 9" />
    </>
  ),
  orient: (
    <>
      <path d="M4 9a8 8 0 1 1 0 6M4 3v6h6" />
      <path d="m10 9 5 3-5 3z" />
    </>
  ),
  pad: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 3" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </>
  ),
  border: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </>
  ),
  round: (
    <path d="M4 14V9a5 5 0 0 1 5-5h5m6 6v5a5 5 0 0 1-5 5h-5M4 20h.01M20 4h.01" />
  ),
  circle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" strokeDasharray="2 3" />
    </>
  ),
  adjust: (
    <>
      <path d="M5 3v4m0 4v10M12 3v10m0 4v4M19 3v3m0 4v11" />
      <path d="M2 7h6m1 10h6m1-11h6" />
    </>
  ),
  gamma: <path d="M4 3v17h17M6 17C9 17 9 6 19 5" />,
  levels: <path d="M4 20V13h4v7m0 0V7h4v13m0 0V3h4v17m0 0V10h4v10M3 20h18" />,
  temperature: (
    <>
      <path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z" />
      <path d="M12 9v8m6-11h3m-3 4h2" />
    </>
  ),
  autocontrast: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 5a7 7 0 0 1 0 14Z" fill="currentColor" />
      <path d="M12 1v1m0 20v1M1 12h1m20 0h1M4 4l1 1m14 14 1 1M4 20l1-1M19 5l1-1" />
    </>
  ),
  sepia: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" opacity=".25" />
      <path d="M8 8h8M7 12h10M8 16h8" />
    </>
  ),
  duotone: (
    <>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" fill="currentColor" fillOpacity=".25" />
    </>
  ),
  posterize: (
    <>
      <path d="M4 20V12h5V7h5V3h6v17Z" />
      <path d="M9 12v8m5-13v13" />
    </>
  ),
  threshold: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path
        d="M12 3h5a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-5Z"
        fill="currentColor"
      />
    </>
  ),
  filter: (
    <>
      <circle cx="9" cy="9" r="6" />
      <circle cx="15" cy="9" r="6" />
      <circle cx="12" cy="15" r="6" />
    </>
  ),
  focus: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="8" strokeDasharray="2 3" />
    </>
  ),
  vignette: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <path d="m4 4 3 3m10 10 3 3M4 20l3-3M17 7l3-3" />
    </>
  ),
  pixelate: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18m6-18v18M3 9h18M3 15h18" />
      <path d="M9 9h6v6H9Z" fill="currentColor" />
    </>
  ),
  noise: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path
        d="M7 7h.01M12 6h.01M17 8h.01M6 12h.01M11 11h.01M16 13h.01M8 17h.01M13 16h.01M18 18h.01"
        strokeWidth="3"
      />
    </>
  ),
  shadow: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="3" />
      <path d="M8 20h9a3 3 0 0 0 3-3V8" strokeWidth="3" opacity=".45" />
    </>
  ),
  edges: <path d="M3 20 8 4l4 11 4-7 5 12M3 3h3m12 0h3M3 3v3m18-3v3" />,
  opacity: (
    <>
      <path d="M12 3C9 7 5 11 5 15a7 7 0 0 0 14 0c0-4-4-8-7-12Z" />
      <path d="M12 9v12M12 14h6m-6 4h6" />
    </>
  ),
  convert: <path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4 4-4-4 4-4" />,
  favicon: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <rect
        x="8"
        y="8"
        width="8"
        height="8"
        rx="2"
        fill="currentColor"
        fillOpacity=".2"
      />
    </>
  ),
  palette: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="15" cy="7" r="1" />
      <circle cx="17" cy="13" r="1" />
      <path d="M5 17c3-5 7 4 10-1" />
    </>
  ),
  datauri: <path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16" />,
  batch: (
    <>
      <rect x="3" y="3" width="13" height="13" rx="3" />
      <path d="M8 20h9a3 3 0 0 0 3-3V8M7 8h5m-5 3h3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8V3m0 18v-5M8 12H3m18 0h-5M9 9 5.5 5.5m13 13L15 15M9 15l-3.5 3.5m13-13L15 9" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </>
  ),
  upload: (
    <path d="M12 16V4m-4 4 4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  local: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4m-3-11 2 2 4-4" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  home: <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2Z" />,
};

export function ToolIcon({
  name,
  size = 20,
}: {
  name: IconName;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name]}
    </svg>
  );
}
