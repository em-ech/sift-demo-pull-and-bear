"use client";

export type SearchMode = "regular" | "sift" | "chat";

interface SearchModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
  disabled?: boolean;
}

const modes: { id: SearchMode; label: React.ReactNode; description: string }[] = [
  {
    id: "regular",
    label: "Regular",
    description: "Basic keyword search",
  },
  {
    id: "sift",
    label: <><span style={{ color: "#2e69c7" }}>Sift</span>Search</>,
    description: "Semantic search",
  },
  {
    id: "chat",
    label: <><span style={{ color: "#2e69c7" }}>Sift</span>Chat</>,
    description: "Ask questions",
  },
];

export function SearchModeToggle({
  mode,
  onChange,
  disabled = false,
}: SearchModeToggleProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[var(--color-text-muted)]">
        Search Mode
      </span>
      <div className="inline-flex border border-[var(--color-border)]">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            disabled={disabled}
            className={`
              relative px-5 py-2.5 text-xs font-bold tracking-[0.08em] uppercase transition-all duration-200
              ${
                mode === m.id
                  ? "bg-black text-white"
                  : "bg-white text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }
              ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
              border-r border-[var(--color-border)] last:border-r-0
            `}
            title={m.description}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
