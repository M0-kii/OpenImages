import { toolById, type ToolId } from "../tools/registry";
import { ToolIcon } from "./ToolIcon";

export interface Tab {
  id: string;
  toolId: ToolId | null;
  docName: string | null;
}

interface Props {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function TabStrip({ tabs, activeId, onSelect, onClose }: Props) {
  return (
    <div className="tabstrip" role="tablist" aria-label="Open tools">
      {tabs.map((tab) => {
        const tool = tab.toolId ? toolById(tab.toolId) : null;
        const active = tab.id === activeId;

        return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            className={`tab ${active ? "is-active" : ""}`}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(tab.id);
              }
              if (
                e.key === "ArrowRight" ||
                e.key === "ArrowLeft" ||
                e.key === "Home" ||
                e.key === "End"
              ) {
                e.preventDefault();
                const index =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (tabs.indexOf(tab) +
                          (e.key === "ArrowRight" ? 1 : -1) +
                          tabs.length) %
                        tabs.length;
                onSelect(tabs[index].id);
                (
                  e.currentTarget.parentElement?.children[index] as HTMLElement
                )?.focus();
              }
            }}
            // Middle-click closes, the way it does in every browser.
            onAuxClick={(e) => {
              if (e.button === 1 && tool) {
                e.preventDefault();
                onClose(tab.id);
              }
            }}
          >
            <span className="tab__glyph" aria-hidden>
              <ToolIcon name={tool ? tool.id : "home"} size={16} />
            </span>
            <span className="tab__label">{tool ? tool.name : "Home"}</span>
            {tab.docName && <span className="tab__doc">{tab.docName}</span>}

            {tool && (
              <button
                className="tab__x"
                tabIndex={active ? 0 : -1}
                aria-label={`Close ${tool.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <svg viewBox="0 0 8 8" aria-hidden>
                  <path d="M0 0l8 8M8 0L0 8" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
