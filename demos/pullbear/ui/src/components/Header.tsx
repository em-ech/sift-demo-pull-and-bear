"use client";

import Link from "next/link";
import { useState } from "react";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [activeGender, setActiveGender] = useState<"men" | "women">("men");

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[var(--color-border)]">
      <div className="w-[90%] mx-auto">
        <div className="flex items-center justify-between h-[60px]">
          {/* Left: Hamburger Menu */}
          <div className="flex items-center gap-6">
            <button
              className="p-1"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                {isMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>

            {/* Gender Toggle - Desktop */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => setActiveGender("women")}
                className={`text-xs font-bold tracking-[0.15em] uppercase transition-colors ${
                  activeGender === "women"
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-text-light)]"
                }`}
              >
                Women
              </button>
              <span className="text-[var(--color-border)]">|</span>
              <button
                onClick={() => setActiveGender("men")}
                className={`text-xs font-bold tracking-[0.15em] uppercase transition-colors ${
                  activeGender === "men"
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-text-light)]"
                }`}
              >
                Men
              </button>
            </div>
          </div>

          {/* Center: Logo */}
          <Link
            href="/"
            className="absolute left-1/2 -translate-x-1/2 flex items-center"
          >
            <span className="text-[22px] font-bold tracking-[0.08em]">
              PULL&amp;BEAR
            </span>
          </Link>

          {/* Right: Icons */}
          <div className="flex items-center gap-5">
            {/* Search - navigates to shop page with search mode */}
            <Link
              href="/shop?mode=search"
              className="hover:opacity-60 transition-opacity"
              aria-label="Search"
            >
              <svg
                className="w-5 h-5"
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
            </Link>

            {/* Profile */}
            <button
              className="hover:opacity-60 transition-opacity hidden sm:block"
              aria-label="Profile"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                />
              </svg>
            </button>

            {/* Bag */}
            <button
              className="hover:opacity-60 transition-opacity"
              aria-label="Shopping bag"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar Menu */}
      {isMenuOpen && (
        <div className="fixed inset-0 top-[60px] z-40 flex">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Sidebar */}
          <div className="relative w-[300px] md:w-[400px] bg-white h-full overflow-y-auto">
            {/* Gender Toggle - Mobile */}
            <div className="flex border-b border-[var(--color-border)] md:hidden">
              <button
                onClick={() => setActiveGender("women")}
                className={`flex-1 py-4 text-xs font-bold tracking-[0.15em] uppercase text-center transition-colors ${
                  activeGender === "women"
                    ? "text-[var(--color-text)] border-b-2 border-black"
                    : "text-[var(--color-text-light)]"
                }`}
              >
                Women
              </button>
              <button
                onClick={() => setActiveGender("men")}
                className={`flex-1 py-4 text-xs font-bold tracking-[0.15em] uppercase text-center transition-colors ${
                  activeGender === "men"
                    ? "text-[var(--color-text)] border-b-2 border-black"
                    : "text-[var(--color-text-light)]"
                }`}
              >
                Men
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="py-6 px-8">
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/shop"
                    className="block py-3 text-sm font-bold tracking-[0.1em] uppercase hover:opacity-60 transition-opacity"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    New
                  </Link>
                </li>
                <li>
                  <Link
                    href="/shop?category=t-shirts"
                    className="block py-3 text-sm font-bold tracking-[0.1em] uppercase hover:opacity-60 transition-opacity"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    T-Shirts
                  </Link>
                </li>
                <li>
                  <Link
                    href="/shop?category=hoodies"
                    className="block py-3 text-sm font-bold tracking-[0.1em] uppercase hover:opacity-60 transition-opacity"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Sweatshirts & Hoodies
                  </Link>
                </li>
                <li>
                  <Link
                    href="/shop?category=jackets"
                    className="block py-3 text-sm font-bold tracking-[0.1em] uppercase hover:opacity-60 transition-opacity"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Jackets & Coats
                  </Link>
                </li>
                <li>
                  <Link
                    href="/shop?category=trousers"
                    className="block py-3 text-sm font-bold tracking-[0.1em] uppercase hover:opacity-60 transition-opacity"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Trousers & Jeans
                  </Link>
                </li>
              </ul>

              <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
                <p className="text-[10px] tracking-[0.15em] uppercase text-[var(--color-text-light)] mb-4">
                  Powered by <span style={{ color: "#2e69c7" }}>Sift</span>Search
                </p>
                <ul className="space-y-1">
                  <li>
                    <Link
                      href="/shop?mode=sift"
                      className="block py-2 text-xs tracking-[0.1em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <span style={{ color: "#2e69c7" }}>Sift</span>Search
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/shop?mode=chat"
                      className="block py-2 text-xs tracking-[0.1em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <span style={{ color: "#2e69c7" }}>Sift</span>Chat
                    </Link>
                  </li>
                </ul>
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
