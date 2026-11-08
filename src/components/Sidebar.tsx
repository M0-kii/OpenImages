import { CATEGORIES, TOOLS, type CategoryId } from "../tools/registry";
import { ToolIcon } from "./ToolIcon";

const CATEGORY_ICONS = {
  transform: "crop",
  color: "adjust",
  effects: "focus",
  output: "convert",
} as const;

export function Sidebar({
  category,
  onCategoryChange,
  onSettings,
}: {
  category: CategoryId | "all" | null;
  onCategoryChange: (category: CategoryId | "all") => void;
  onSettings: () => void;
}) {
  return (
    <aside className="library-sidebar">
      <nav className="library-nav" aria-label="Tool categories">
        <span className="library-nav__label">Workspace</span>
        <button
          className={`library-nav__item ${category === "all" ? "is-active" : ""}`}
          aria-pressed={category === "all"}
          onClick={() => onCategoryChange("all")}
        >
          <ToolIcon name="all" />
          <span>All tools</span>
          <span className="library-nav__count">{TOOLS.length}</span>
        </button>
        <span className="library-nav__label library-nav__label--categories">
          Categories
        </span>
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            className={`library-nav__item ${category === cat.id ? "is-active" : ""}`}
            aria-pressed={category === cat.id}
            onClick={() => onCategoryChange(cat.id)}
          >
            <ToolIcon name={CATEGORY_ICONS[cat.id]} />
            <span>{cat.name}</span>
            <span className="library-nav__count">
              {TOOLS.filter((t) => t.category === cat.id).length}
            </span>
          </button>
        ))}
      </nav>
      <div className="library-sidebar__bottom">
        <button className="library-nav__item" onClick={onSettings}>
          <ToolIcon name="settings" />
          <span>Settings</span>
          <kbd>Ctrl ,</kbd>
        </button>
      </div>
    </aside>
  );
}
