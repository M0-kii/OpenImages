import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  searchTools,
  type CategoryId,
  type ToolId,
} from "../tools/registry";
import { ToolIcon } from "./ToolIcon";

interface Props {
  onOpen: (id: ToolId) => void;
  onPickFile: () => void;
  category: CategoryId | "all";
  onCategoryChange: (category: CategoryId | "all") => void;
}

export function Home({
  onOpen,
  onPickFile,
  category,
  onCategoryChange,
}: Props) {
  const [query, setQuery] = useState("");
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
  const title = searching
    ? "Search results"
    : (currentCategory?.name ?? "All tools");
  const groups =
    category === "all" && !searching
      ? CATEGORIES.map(({ id, name }) => ({
          name,
          tools: results.filter((tool) => tool.category === id),
        }))
      : [{ name: null, tools: results }];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !e.defaultPrevented &&
        e.key === "/" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest(
            "input, textarea, [contenteditable], [role=menu], [role=listbox], [role=dialog], dialog",
          )
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
      <header className="library-toolbar">
        <div className="library-title">
          <h1 id="tool-library-title">{title}</h1>
          <p>
            {results.length} {results.length === 1 ? "tool" : "tools"}
          </p>
        </div>
        <div className="search">
          <ToolIcon name="search" size={17} />
          <label className="sr-only" htmlFor="tool-search">
            Search tools
          </label>
          <input
            id="tool-search"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) onOpen(results[0].id);
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
        <button
          className="btn btn--primary"
          onClick={onPickFile}
          title="Open image (Ctrl+O)"
        >
          <ToolIcon name="upload" size={16} />
          Open image
        </button>
      </header>

      <section className="library-scroll" aria-labelledby="tool-library-title">
        {results.length ? (
          groups.map(({ name, tools }) => (
            <div className="tool-group" key={name ?? "results"}>
              {name && <h2>{name}</h2>}
              <ul className="tool-list" role="list" aria-label={name ?? title}>
                {tools.map((tool) => (
                  <li key={tool.id}>
                    <button className="tool-row" onClick={() => onOpen(tool.id)}>
                      <span className="tool-row__icon">
                        <ToolIcon name={tool.id} size={21} />
                      </span>
                      <span className="tool-row__copy">
                        <span className="tool-row__name">{tool.name}</span>
                        <span className="tool-row__blurb">{tool.blurb}</span>
                      </span>
                      <span className="tool-row__go">
                        <ToolIcon name="chevron" size={14} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div className="home__empty">
            <div role="status">
              <h2>No tools found</h2>
              <p>
                Try another search
                {currentCategory
                  ? " or look in all tools"
                  : ", like crop or convert"}
                .
              </p>
            </div>
            <button
              className="btn"
              onClick={() => {
                setQuery("");
                onCategoryChange("all");
                inputRef.current?.focus();
              }}
            >
              Show all tools
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
