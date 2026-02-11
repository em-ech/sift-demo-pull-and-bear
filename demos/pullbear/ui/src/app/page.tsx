import Link from "next/link";
import Image from "next/image";
import { ProductGrid } from "@/components";
import { getFeaturedProducts, getCategories } from "@/lib/data.server";

export default async function HomePage() {
  const featuredProducts = await getFeaturedProducts(8);
  const categories = await getCategories();

  const categoryImagesBySlug: Record<string, string> = {
    "t-shirts":
      "https://static.pullandbear.net/2/photos//2021/I/0/2/p/8241/912/800/8241912800_4_1_8.jpg",
    hoodies:
      "https://static.pullandbear.net/2/photos//2021/I/0/2/p/8591/541/711/8591541711_2_6_8.jpg",
    jackets:
      "https://static.pullandbear.net/2/photos//2021/I/0/2/p/4751/501/800/4751501800_4_1_8.jpg",
    trousers:
      "https://static.pullandbear.net/2/photos//2021/I/0/2/p/8676/519/800/8676519800_4_1_8.jpg",
  };

  const getCategoryImage = (slug: string) =>
    categoryImagesBySlug[slug] || categoryImagesBySlug[slug.toLowerCase()] || null;

  return (
    <div>
      {/* Hero Section - Full width P&B style */}
      <section className="relative h-[70vh] min-h-[500px] max-h-[800px] flex items-center justify-center overflow-hidden bg-black">
        <div className="absolute inset-0">
          <Image
            src="https://static.pullandbear.net/2/photos//2021/I/0/2/p/8591/541/711/8591541711_2_6_8.jpg"
            alt="New In"
            fill
            className="object-cover opacity-60"
            priority
          />
        </div>

        <div className="relative z-10 text-center px-4">
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white tracking-[0.08em] mb-6">
            NEW IN
          </h1>
          <Link href="/shop" className="btn bg-white text-black hover:bg-white/90 border-white">
            SHOP NOW
          </Link>
        </div>
      </section>

      {/* Category Cards - 3 columns like P&B */}
      <section className="py-1">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1">
          {categories.slice(0, 3).map((category) => (
            <Link
              key={category.slug}
              href={`/shop?category=${category.slug}`}
              className="group relative aspect-[3/4] overflow-hidden"
            >
              {getCategoryImage(category.slug) && (
                <Image
                  src={getCategoryImage(category.slug)!}
                  alt={category.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                />
              )}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
              <div className="absolute bottom-8 left-8">
                <span className="text-white text-lg font-bold tracking-[0.1em] uppercase">
                  {category.name}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Category Filter Tags */}
      <section className="py-10 border-b border-[var(--color-border)]">
        <div className="w-[90%] mx-auto">
          <div className="flex items-center justify-center gap-6 sm:gap-10 flex-wrap">
            {categories.map((category) => (
              <Link
                key={category.slug}
                href={`/shop?category=${category.slug}`}
                className="category-tag text-xs font-bold tracking-[0.15em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors pb-1"
              >
                {category.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-12 sm:py-16">
        <div className="w-[90%] mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-lg font-bold tracking-[0.1em]">NEW ARRIVALS</h2>
            <Link
              href="/shop"
              className="text-xs tracking-[0.1em] uppercase text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            >
              View All
            </Link>
          </div>
          <ProductGrid products={featuredProducts} />
        </div>
      </section>

      {/* Sift AI Feature Banner */}
      <section className="py-16 sm:py-20 bg-[var(--color-background-alt)]">
        <div className="w-[90%] mx-auto">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--color-text-muted)] mb-4">
              Powered by <span style={{ color: "#2e69c7" }}>Sift</span>Search
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[0.08em] mb-4">
              FIND YOUR STYLE
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mb-8 max-w-lg mx-auto leading-relaxed">
              Use our AI-powered search to discover clothes based on your mood
              and style. Try &ldquo;something for a night out&rdquo; or
              &ldquo;casual streetwear under $30&rdquo;.
            </p>

            <div className="grid grid-cols-3 gap-8 mb-10">
              <Link href="/shop?mode=search" className="text-center group">
                <div className="w-12 h-12 mx-auto mb-3 border border-[var(--color-border)] flex items-center justify-center group-hover:border-black transition-colors">
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
                </div>
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase">
                  Search
                </p>
              </Link>
              <Link href="/shop?mode=sift" className="text-center group">
                <div className="w-12 h-12 mx-auto mb-3 bg-black text-white flex items-center justify-center group-hover:bg-black/80 transition-colors">
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
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase">
                  <span style={{ color: "#2e69c7" }}>Sift</span>Search
                </p>
              </Link>
              <Link href="/shop?mode=chat" className="text-center group">
                <div className="w-12 h-12 mx-auto mb-3 border border-[var(--color-border)] flex items-center justify-center group-hover:border-black transition-colors">
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
                      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                    />
                  </svg>
                </div>
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase">
                  <span style={{ color: "#2e69c7" }}>Sift</span>Chat
                </p>
              </Link>
            </div>

            <Link href="/shop?mode=sift" className="btn btn-primary">
              Try <span style={{ color: "#2e69c7" }}>Sift</span>Search
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
