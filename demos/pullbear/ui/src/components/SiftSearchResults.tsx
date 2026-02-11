"use client";

import Image from "next/image";
import Link from "next/link";
import type { SiftSearchResult } from "@/lib/api";

interface SiftSearchResultsProps {
  results: SiftSearchResult[];
  query: string;
  isLoading?: boolean;
}

export function SiftSearchResults({
  results,
  query,
  isLoading = false,
}: SiftSearchResultsProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="relative w-12 h-12 mb-4">
          <div className="absolute inset-0 border-2 border-[var(--color-border)] rounded-full" />
          <div className="absolute inset-0 border-2 border-black rounded-full border-t-transparent animate-spin" />
        </div>
        <p className="text-xs tracking-[0.1em] uppercase text-[var(--color-text-muted)]">
          Searching for &ldquo;{query}&rdquo;...
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-16">
        <h3 className="text-sm font-bold tracking-[0.08em] uppercase mb-2">
          No matches found
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          Try a different search or browse all products
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Results Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
        <div>
          <h2 className="text-sm font-bold tracking-[0.08em] uppercase">
            AI Search Results
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {results.length} products matching &ldquo;{query}&rdquo;
          </p>
        </div>
        <span className="text-[10px] tracking-[0.1em] uppercase text-[var(--color-text-muted)]">
          Powered by <span style={{ color: "#2e69c7" }}>Sift</span>Search
        </span>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
        {results.map((result, index) => (
          <Link
            key={`${result.id}-${index}`}
            href={`/product/${result.id}`}
            className="group block"
          >
            {/* Image */}
            <div className="aspect-[3/4] relative overflow-hidden bg-[var(--color-background-alt)] mb-3">
              {result.image_url ? (
                <Image
                  src={result.image_url}
                  alt={result.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-cover group-hover:opacity-85 transition-opacity"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[var(--color-text-light)]">
                  <span className="text-xs uppercase tracking-wider">
                    No image
                  </span>
                </div>
              )}

              {/* Match Badge */}
              <div className="absolute top-0 left-0 bg-black text-white px-2 py-1">
                <span className="text-[10px] font-bold tracking-wide">
                  {Math.round(result.score * 100)}% match
                </span>
              </div>
            </div>

            {/* Content */}
            <div>
              <h3 className="text-xs font-normal tracking-wide leading-snug">
                {result.name}
              </h3>
              {result.price != null && (
                <p className="mt-1 text-xs font-bold">
                  $
                  {typeof result.price === "number"
                    ? result.price.toFixed(2)
                    : parseFloat(String(result.price)).toFixed(2)}
                </p>
              )}
              {result.category && (
                <p className="mt-1 text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider">
                  {result.category}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
