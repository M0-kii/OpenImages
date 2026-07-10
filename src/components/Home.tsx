import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, searchTools, TOOLS, type Tool, type ToolId } from "../tools/registry";

export function Home({ onOpen }: { onOpen: (id: ToolId) => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchTools(query), [query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // "/" focuses search from anywhere on this screen, like a browser find bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    tools: TOOLS.filter((t) => t.category === cat.id),
  }));

  return (
    <div className="home">
      <div className="home__inner">
        <header className="home__head">
          <h1 className="wordmark">
            Open<em>Images</em>
          </h1>
          <p className="home__sub">
            Every image chore, on your machine. Nothing is uploaded anywhere.
          </p>
        </header>

        <div className="search">
          <svg className="search__icon" viewBox="0 0 16 16" aria-hidden>
            <circle cx="7" cy="7" r="4.6" />
            <path d="M10.5 10.5L15 15" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) onOpen(results[0].id);
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="Search tools —  try “ico”, “compress”, “black and white”"
            aria-label="Search tools"
            spellCheck={false}
          />
          {query && (
            <button className="search__clear" onClick={() => setQuery("")} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        {searching ? (
          results.length ? (
            <section className="home__section">
              <SectionHead
                title="Results"
                blurb={`${results.length} tool${results.length === 1 ? "" : "s"} · Enter opens the first`}
              />
              <Grid tools={results} onOpen={onOpen} />
            </section>
          ) : (
            <p className="home__empty">
              Nothing matches “{query}”. Try <em>crop</em>, <em>favicon</em>, or <em>webp</em>.
            </p>
          )
        ) : (
          grouped.map(({ cat, tools }, i) => (
            <section className="home__section" key={cat.id} style={{ ["--i" as string]: i }}>
              <SectionHead title={cat.name} blurb={cat.blurb} />
              <Grid tools={tools} onOpen={onOpen} />
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function SectionHead({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div className="sectionhead">
      <h2>{title}</h2>
      <span>{blurb}</span>
      <i className="rule" />
    </div>
  );
}

function Grid({ tools, onOpen }: { tools: Tool[]; onOpen: (id: ToolId) => void }) {
  return (
    <div className="grid">
      {tools.map((tool, i) => (
        <button
          key={tool.id}
          className="card"
          style={{ ["--i" as string]: i }}
          onClick={() => onOpen(tool.id)}
        >
          <span className="card__glyph" aria-hidden>
            {tool.glyph}
          </span>
          <span className="card__body">
            <span className="card__name">{tool.name}</span>
            <span className="card__blurb">{tool.blurb}</span>
          </span>
          <span className="card__go" aria-hidden>
            →
          </span>
        </button>
      ))}
    </div>
  );
}
