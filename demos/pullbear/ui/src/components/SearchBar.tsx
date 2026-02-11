"use client";

import type { SearchMode } from "./SearchModeToggle";

interface SearchBarProps {
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  query: string;
  onQueryChange: (query: string) => void;
  isLoading?: boolean;
  aiAvailable?: boolean;
}

const modes: { id: SearchMode; label: React.ReactNode }[] = [
  { id: "regular", label: "Search" },
  { id: "sift", label: <><span style={{ color: "#2e69c7" }}>Sift</span>Search</> },
  { id: "chat", label: <><span style={{ color: "#2e69c7" }}>Sift</span>Chat</> },
];

const placeholders: Record<SearchMode, string> = {
  regular: "Search products...",
  sift: "Describe what you're looking for...",
  chat: "Ask about styles, outfits, recommendations...",
};

export function SearchBar({
  mode,
  onModeChange,
  query,
  onQueryChange,
  isLoading = false,
  aiAvailable = true,
}: SearchBarProps) {
  return (
    <div className="w-full">
      {/* Mode Toggle Pills */}
      <div className="flex mb-0">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onModeChange(m.id)}
            className={`
              px-5 py-2 text-[10px] font-bold tracking-[0.12em] uppercase transition-all duration-200
              border border-b-0 border-[var(--color-border)]
              ${
                mode === m.id
                  ? "bg-black text-white border-black"
                  : "bg-white text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-background-alt)]"
              }
              ${m.id !== "regular" && !aiAvailable ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
              first:border-r-0 last:border-l-0
            `}
            disabled={m.id !== "regular" && !aiAvailable}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Search Input */}
      {mode !== "chat" && (
        <div className="relative">
          <input
            type="text"
            placeholder={placeholders[mode]}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="w-full pl-10 pr-4 py-3.5 border border-[var(--color-border)] focus:border-black focus:outline-none text-xs transition-colors"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-light)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
