"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  ProductGrid,
  SearchBar,
  ChatPanel,
  SiftSearchResults,
  type SearchMode,
} from "@/components";
import { getProducts, getCategories } from "@/lib/data";
import {
  siftSearch,
  checkBackendHealth,
  type SiftSearchResult,
  type HealthStatus,
} from "@/lib/api";
import type { Product, Category, SortOption } from "@/lib/types";

function ShopPageContent() {
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  const modeParam = searchParams.get("mode");

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const initialMode: SearchMode =
    modeParam === "sift"
      ? "sift"
      : modeParam === "chat"
      ? "chat"
      : "regular";
  const [searchMode, setSearchMode] = useState<SearchMode>(initialMode);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    categoryParam
  );
  const [sortBy, setSortBy] = useState<SortOption>("name");

  const [siftResults, setSiftResults] = useState<SiftSearchResult[]>([]);
  const [siftLoading, setSiftLoading] = useState(false);
  const [lastSiftQuery, setLastSiftQuery] = useState("");

  useEffect(() => {
    async function loadData() {
      const [productsData, categoriesData] = await Promise.all([
        getProducts(),
        getCategories(),
      ]);
      setProducts(productsData);
      setCategories(categoriesData);
      setLoading(false);
    }
    loadData();
  }, []);

  useEffect(() => {
    async function checkHealth() {
      const status = await checkBackendHealth();
      setHealthStatus(status);
    }
    checkHealth();
  }, []);

  useEffect(() => {
    setSelectedCategory(categoryParam);
  }, [categoryParam]);

  useEffect(() => {
    if (modeParam === "sift") setSearchMode("sift");
    else if (modeParam === "chat") setSearchMode("chat");
    else if (modeParam === "search") setSearchMode("regular");
  }, [modeParam]);

  useEffect(() => {
    if (searchMode !== "sift" || !searchQuery.trim()) {
      setSiftResults([]);
      setLastSiftQuery("");
      return;
    }

    const timeoutId = setTimeout(async () => {
      if (searchQuery === lastSiftQuery) return;

      setSiftLoading(true);
      try {
        const response = await siftSearch(searchQuery, 12);
        setSiftResults(response.results);
        setLastSiftQuery(searchQuery);
      } catch (error) {
        console.error("Sift search error:", error);
        setSiftResults([]);
      } finally {
        setSiftLoading(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchMode, lastSiftQuery]);

  const filteredProducts = useMemo(() => {
    if (searchMode !== "regular") return products;

    let result = [...products];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.shortDescription?.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query))
      );
    }

    if (selectedCategory) {
      result = result.filter((p) => p.categories.includes(selectedCategory));
    }

    switch (sortBy) {
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "price-asc":
        result.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case "price-desc":
        result.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case "newest":
        break;
    }

    return result;
  }, [products, searchQuery, selectedCategory, sortBy, searchMode]);

  const handleModeChange = useCallback((mode: SearchMode) => {
    setSearchMode(mode);
    if (mode === "chat") {
      setSearchQuery("");
    }
  }, []);

  const handleChatProductsFound = useCallback(
    (foundProducts: SiftSearchResult[]) => {
      console.log("Products found via chat:", foundProducts);
    },
    []
  );

  const aiAvailable = healthStatus?.python === true;

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-[var(--color-text-muted)] text-xs uppercase tracking-[0.1em]">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 sm:py-12">
      <div className="w-[90%] mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-[0.08em] mb-2">
            {searchMode === "chat"
              ? "STYLE ASSISTANT"
              : selectedCategory
              ? (
                  categories.find((c) => c.slug === selectedCategory)?.name ||
                  "Shop"
                ).toUpperCase()
              : "ALL PRODUCTS"}
          </h1>
          {searchMode !== "chat" && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {searchMode === "sift" && siftResults.length > 0
                ? `${siftResults.length} AI-matched products`
                : `${filteredProducts.length} product${
                    filteredProducts.length !== 1 ? "s" : ""
                  }`}
            </p>
          )}
        </div>

        {/* Integrated Search Bar + Mode Toggle */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 pb-6 border-b border-[var(--color-border)]">
          <div className="flex-1 max-w-xl">
            <SearchBar
              mode={searchMode}
              onModeChange={handleModeChange}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              isLoading={siftLoading && searchQuery.length > 0}
              aiAvailable={aiAvailable}
            />
          </div>

          <div className="flex items-center gap-2 text-[10px] tracking-[0.1em] uppercase">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                healthStatus?.python
                  ? "bg-green-500"
                  : healthStatus === null
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-red-500"
              }`}
            />
            <span className="text-[var(--color-text-muted)]">
              {healthStatus?.python
                ? "SiftSearch Connected"
                : healthStatus === null
                ? "Checking..."
                : "AI Offline"}
            </span>
          </div>
        </div>

        {/* Backend Offline Warning */}
        {healthStatus && !healthStatus.python && searchMode !== "regular" && (
          <div className="mb-6 p-4 border border-[var(--color-border)]">
            <h3 className="text-xs font-bold tracking-[0.08em] uppercase mb-1">
              Backend Server Not Running
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mb-2">
              Start the backend to use{" "}
              {searchMode === "sift" ? "AI search" : "chat"}:
            </p>
            <code className="block text-[10px] bg-[var(--color-background-alt)] px-3 py-2 font-mono">
              cd backend && uv run uvicorn app.main:app --reload --port 8000
            </code>
          </div>
        )}

        {/* Chat Mode */}
        {searchMode === "chat" && (
          <div className="max-w-2xl mx-auto">
            <ChatPanel onProductsFound={handleChatProductsFound} />
          </div>
        )}

        {/* Search Modes (Regular & Sift) */}
        {searchMode !== "chat" && (
          <>
            {/* Filters Bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-8">
              {/* Category Filter */}
              {searchMode === "regular" && (
                <div className="sm:w-44">
                  <select
                    value={selectedCategory || ""}
                    onChange={(e) =>
                      setSelectedCategory(e.target.value || null)
                    }
                    className="w-full px-4 py-3 border border-[var(--color-border)] focus:border-black focus:outline-none bg-white text-xs transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sort */}
              {searchMode === "regular" && (
                <div className="sm:w-44">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                    className="w-full px-4 py-3 border border-[var(--color-border)] focus:border-black focus:outline-none bg-white text-xs transition-colors appearance-none cursor-pointer"
                  >
                    <option value="name">Name A-Z</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="newest">Newest</option>
                  </select>
                </div>
              )}
            </div>

            {/* Active Filters */}
            {searchMode === "regular" && (searchQuery || selectedCategory) && (
              <div className="flex flex-wrap gap-2 mb-8">
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--color-border)] text-[10px] tracking-[0.08em] uppercase hover:border-black transition-colors"
                  >
                    {searchQuery}
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                )}
                {selectedCategory && (
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className="inline-flex items-center gap-2 px-3 py-1.5 border border-[var(--color-border)] text-[10px] tracking-[0.08em] uppercase hover:border-black transition-colors"
                  >
                    {categories.find((c) => c.slug === selectedCategory)?.name}
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory(null);
                  }}
                  className="text-[10px] tracking-[0.08em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors px-2"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Results */}
            {searchMode === "sift" ? (
              <SiftSearchResults
                results={siftResults}
                query={searchQuery}
                isLoading={siftLoading && searchQuery.length > 0}
              />
            ) : (
              <ProductGrid
                products={filteredProducts}
                emptyMessage={
                  searchQuery || selectedCategory
                    ? "No products match your filters."
                    : "No products available."
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ShopPageLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-[var(--color-text-muted)] text-xs uppercase tracking-[0.1em]">
        Loading...
      </div>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<ShopPageLoading />}>
      <ShopPageContent />
    </Suspense>
  );
}
