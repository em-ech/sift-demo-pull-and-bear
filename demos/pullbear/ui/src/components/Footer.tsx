import Link from "next/link";

export function Footer() {
  return (
    <footer className="bg-white border-t border-[var(--color-border)]">
      <div className="w-[90%] mx-auto py-12 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Customer Service */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.1em] uppercase mb-5">
              Customer Service
            </h4>
            <ul className="space-y-3">
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Chat
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  WhatsApp
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Contact
                </span>
              </li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.1em] uppercase mb-5">
              Help
            </h4>
            <ul className="space-y-3">
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Returns
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Delivery
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Payment
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Gift Card
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  FAQs
                </span>
              </li>
            </ul>
          </div>

          {/* Business */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.1em] uppercase mb-5">
              Business
            </h4>
            <ul className="space-y-3">
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  About Us
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Store Locator
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Franchise
                </span>
              </li>
              <li>
                <span className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer">
                  Work with us
                </span>
              </li>
            </ul>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-xs font-bold tracking-[0.1em] uppercase mb-5">
              Shop
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/shop"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  All Products
                </Link>
              </li>
              <li>
                <Link
                  href="/shop?category=t-shirts"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  T-Shirts
                </Link>
              </li>
              <li>
                <Link
                  href="/shop?category=hoodies"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Hoodies
                </Link>
              </li>
              <li>
                <Link
                  href="/shop?category=jackets"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Jackets
                </Link>
              </li>
              <li>
                <Link
                  href="/shop?category=trousers"
                  className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Trousers
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-8 border-t border-[var(--color-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[22px] font-bold tracking-[0.08em]">
            PULL&amp;BEAR
          </span>
          <p className="text-[10px] text-[var(--color-text-light)] tracking-[0.1em] uppercase text-center">
            Demo storefront powered by <span style={{ color: "#2e69c7" }}>Sift</span>Search &mdash; Product data for educational purposes
          </p>
        </div>
      </div>
    </footer>
  );
}
