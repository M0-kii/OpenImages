import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  searchTools,
  TOOLS,
  type CategoryId,
  type ToolId,
} from "../tools/registry";
import { ToolIcon } from "./ToolIcon";

interface Props {
  onOpen: (id: ToolId) => void;
  onPickFile: () => void;
  onSettings: () => void;
}

const CATEGORY_ICONS = {
  transform: "crop",
  color: "adjust",
  effects: "focus",
  output: "convert",
} as const;

export function Home({ onOpen, onPickFile, onSettings }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryId | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(
    () =>
      searchTools(query).filter(
        (t) => category === "all" || t.category === category,
      ),
    [query, category],
  );
  const currentCategory = CATEGORIES.find((c) => c.id === category);
  const searching = query.trim().length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("input, textarea, [contenteditable]")
        )
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="home">
      <aside className="library-sidebar">
        <div className="library-sidebar__brand">
          OpenImages<span>Made for your images.</span>
        </div>
        <nav className="library-nav" aria-label="Tool categories">
          <span className="library-nav__label">Workspace</span>
          <button
            className={`library-nav__item ${category === "all" ? "is-active" : ""}`}
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
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
              onClick={() => setCategory(cat.id)}
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
          <div className="local-note">
            <ToolIcon name="local" />
            <div>
              On your device.<span>Your images stay with you.</span>
            </div>
          </div>
          <button className="library-nav__item" onClick={onSettings}>
            <ToolIcon name="settings" />
            <span>Settings</span>
            <kbd>Ctrl ,</kbd>
          </button>
        </div>
      </aside>

      <div className="library-main">
        <header className="library-toolbar">
          <div className="library-toolbar__location">
            <ToolIcon name="all" size={18} />
            <span>Workspace</span>
            <ToolIcon name="chevron" size={12} />
            <strong>{currentCategory?.name ?? "All tools"}</strong>
          </div>
          <button className="btn btn--primary" onClick={onPickFile}>
            <ToolIcon name="upload" size={16} />
            Open image
          </button>
        </header>

        <div className="library-scroll">
          <div className="home__inner">
            <section className="welcome" aria-labelledby="welcome-title">
              <div className="welcome__copy">
                <span className="welcome__eyebrow">
                  A little space to create
                </span>
                <h1 id="welcome-title">
                  Small edits.
                  <br />
                  <span>Beautiful possibilities.</span>
                </h1>
                <p>
                  Crop, fine-tune, and make it your own.
                  <br />
                  Everything your image needs, right here.
                </p>
                <button
                  className="btn btn--primary btn--lg"
                  onClick={onPickFile}
                >
                  <ToolIcon name="image" size={18} />
                  Open an image
                </button>
                <span className="welcome__hint">
                  or drop one anywhere <span>·</span> <kbd>Ctrl O</kbd>
                </span>
              </div>
              <div className="welcome__art" aria-hidden="true">
                <div className="image-sheet image-sheet--back" />
                <div className="image-sheet image-sheet--middle" />
                <div className="image-sheet image-sheet--front">
                  <div className="image-sheet__scene">
                    <span className="image-sheet__sun" />
                    <span className="image-sheet__hill image-sheet__hill--back" />
                    <span className="image-sheet__hill" />
                  </div>
                  <div className="image-sheet__crop">
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <span className="welcome__art-icon">
                  <ToolIcon name="crop" size={25} />
                </span>
              </div>
            </section>

            <section
              className="tool-library"
              aria-labelledby="tool-library-title"
            >
              <div className="library-heading">
                <div>
                  <h2 id="tool-library-title">
                    {searching
                      ? "Search results"
                      : (currentCategory?.name ?? "Your toolkit")}
                    <span>{results.length}</span>
                  </h2>
                  <p>
                    {searching
                      ? `Tools matching “${query.trim()}”`
                      : (currentCategory?.blurb ??
                        "Find the right tool for the finishing touch.")}
                  </p>
                </div>
                <div className="search">
                  <ToolIcon name="search" size={18} />
                  <label className="sr-only" htmlFor="tool-search">
                    Search tools
                  </label>
                  <input
                    id="tool-search"
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && results[0])
                        onOpen(results[0].id);
                      if (e.key === "Escape") setQuery("");
                    }}
                    placeholder="Search tools…"
                    spellCheck={false}
                  />
                  {query ? (
                    <button
                      className="search__clear"
                      onClick={() => {
                        setQuery("");
                        inputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                    >
                      <ToolIcon name="close" size={15} />
                    </button>
                  ) : (
                    <kbd>/</kbd>
                  )}
                </div>
              </div>

              {results.length ? (
                <div className="tool-grid">
                  {results.map((tool) => (
                    <button
                      key={tool.id}
                      className="tool-card"
                      onClick={() => onOpen(tool.id)}
                    >
                      <span
                        className={`tool-card__icon tool-card__icon--${tool.category}`}
                      >
                        <ToolIcon name={tool.id} size={25} />
                      </span>
                      <span className="tool-card__name">{tool.name}</span>
                      <span className="tool-card__blurb">{tool.blurb}</span>
                      <span className="tool-card__category">
                        {CATEGORIES.find((c) => c.id === tool.category)?.name}
                      </span>
                      <span className="tool-card__go">
                        <ToolIcon name="chevron" size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="home__empty" role="status">
                  <ToolIcon name="search" size={30} />
                  <h3>No tools found</h3>
                  <p>
                    Try another search
                    {currentCategory
                      ? " or look in all tools"
                      : ", like crop or convert"}
                    .
                  </p>
                  <button
                    className="btn"
                    onClick={() => {
                      setQuery("");
                      setCategory("all");
                    }}
                  >
                    Show all tools
                  </button>
                </div>
              )}
            </section>
            <footer className="library-footer">
              <span>A little less effort. A little more possibility.</span>
              <span>
                OpenImages <span>·</span> Local image toolkit
              </span>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
