/**
 * Sift Retail AI - Search Widget
 *
 * Embeddable semantic search widget for retailers.
 *
 * Usage:
 * <script
 *   src="https://your-domain/sift-search-widget.js"
 *   data-api-key="sk_live_..."
 *   data-tenant-id="your-tenant"
 *   data-container="#search-container"
 *   data-theme="light"
 * ></script>
 */

(function () {
  "use strict";

  // Get configuration from script tag
  const currentScript = document.currentScript;
  const config = {
    apiKey: currentScript?.getAttribute("data-api-key") || "",
    tenantId: currentScript?.getAttribute("data-tenant-id") || "",
    apiUrl: currentScript?.getAttribute("data-api-url") || "http://localhost:8000",
    container: currentScript?.getAttribute("data-container") || "#sift-search",
    theme: currentScript?.getAttribute("data-theme") || "light",
    placeholder: currentScript?.getAttribute("data-placeholder") || "Search products...",
    maxResults: parseInt(currentScript?.getAttribute("data-max-results") || "5"),
  };

  // Styles
  const styles = `
    .sift-search-widget {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      position: relative;
      width: 100%;
      max-width: 600px;
    }

    .sift-search-input-wrapper {
      position: relative;
    }

    .sift-search-input {
      width: 100%;
      padding: 12px 16px;
      padding-right: 40px;
      font-size: 16px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      outline: none;
      transition: border-color 0.2s, box-shadow 0.2s;
      background: ${config.theme === "dark" ? "#1f2937" : "#ffffff"};
      color: ${config.theme === "dark" ? "#ffffff" : "#1f2937"};
    }

    .sift-search-input:focus {
      border-color: #000000;
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
    }

    .sift-search-input::placeholder {
      color: #9ca3af;
    }

    .sift-search-icon {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      color: #9ca3af;
    }

    .sift-search-loading {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      width: 20px;
      height: 20px;
      border: 2px solid #e5e7eb;
      border-top-color: #000000;
      border-radius: 50%;
      animation: sift-spin 0.8s linear infinite;
    }

    @keyframes sift-spin {
      to { transform: translateY(-50%) rotate(360deg); }
    }

    .sift-search-results {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 8px;
      background: ${config.theme === "dark" ? "#1f2937" : "#ffffff"};
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      max-height: 400px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    }

    .sift-search-results.active {
      display: block;
    }

    .sift-search-result {
      display: flex;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid #f3f4f6;
      cursor: pointer;
      transition: background-color 0.15s;
      text-decoration: none;
      color: inherit;
    }

    .sift-search-result:last-child {
      border-bottom: none;
    }

    .sift-search-result:hover {
      background: ${config.theme === "dark" ? "#374151" : "#f9fafb"};
    }

    .sift-search-result-image {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 4px;
      margin-right: 12px;
      flex-shrink: 0;
      background: #f3f4f6;
    }

    .sift-search-result-info {
      flex: 1;
      min-width: 0;
    }

    .sift-search-result-name {
      font-weight: 500;
      font-size: 14px;
      color: ${config.theme === "dark" ? "#ffffff" : "#1f2937"};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 2px;
    }

    .sift-search-result-price {
      font-size: 14px;
      color: ${config.theme === "dark" ? "#9ca3af" : "#6b7280"};
    }

    .sift-search-no-results {
      padding: 16px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }

    .sift-search-constraints {
      padding: 8px 12px;
      background: ${config.theme === "dark" ? "#374151" : "#f3f4f6"};
      border-bottom: 1px solid #e5e7eb;
      font-size: 12px;
      color: #6b7280;
    }

    .sift-search-constraint-tag {
      display: inline-block;
      background: #000000;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 4px;
      margin-right: 4px;
      font-size: 11px;
    }

    .sift-search-powered {
      padding: 8px 12px;
      text-align: center;
      font-size: 11px;
      color: #9ca3af;
      border-top: 1px solid #f3f4f6;
    }

    .sift-search-powered a {
      color: #6b7280;
      text-decoration: none;
    }

    .sift-search-powered a:hover {
      text-decoration: underline;
    }
  `;

  // Inject styles
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Widget state
  let searchTimeout = null;
  let currentSearchEventId = null;

  // Create widget HTML
  function createWidget() {
    const container = document.querySelector(config.container);
    if (!container) {
      console.error("Sift Search: Container not found:", config.container);
      return;
    }

    container.innerHTML = `
      <div class="sift-search-widget">
        <div class="sift-search-input-wrapper">
          <input
            type="text"
            class="sift-search-input"
            placeholder="${config.placeholder}"
            autocomplete="off"
          />
          <svg class="sift-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        <div class="sift-search-results"></div>
      </div>
    `;

    // Get elements
    const input = container.querySelector(".sift-search-input");
    const resultsContainer = container.querySelector(".sift-search-results");
    const iconContainer = container.querySelector(".sift-search-input-wrapper");

    // Event listeners
    input.addEventListener("input", (e) => {
      const query = e.target.value.trim();

      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      if (query.length < 2) {
        resultsContainer.classList.remove("active");
        return;
      }

      // Show loading
      const icon = iconContainer.querySelector(".sift-search-icon");
      if (icon) {
        icon.outerHTML = '<div class="sift-search-loading"></div>';
      }

      // Debounce search
      searchTimeout = setTimeout(() => {
        performSearch(query, resultsContainer, iconContainer);
      }, 300);
    });

    input.addEventListener("focus", () => {
      if (resultsContainer.children.length > 0) {
        resultsContainer.classList.add("active");
      }
    });

    // Close on click outside
    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) {
        resultsContainer.classList.remove("active");
      }
    });

    // Keyboard navigation
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        resultsContainer.classList.remove("active");
      }
    });
  }

  // Perform search
  async function performSearch(query, resultsContainer, iconContainer) {
    try {
      const response = await fetch(`${config.apiUrl}/search/v1/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": config.apiKey,
        },
        body: JSON.stringify({
          query: query,
          tenant_id: config.tenantId,
          top_k: config.maxResults,
          use_query_understanding: true,
        }),
      });

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      currentSearchEventId = data.search_event_id;

      renderResults(data, resultsContainer);
    } catch (error) {
      console.error("Sift Search error:", error);
      resultsContainer.innerHTML = `
        <div class="sift-search-no-results">
          Search unavailable. Please try again.
        </div>
      `;
      resultsContainer.classList.add("active");
    } finally {
      // Restore search icon
      const loading = iconContainer.querySelector(".sift-search-loading");
      if (loading) {
        loading.outerHTML = `
          <svg class="sift-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        `;
      }
    }
  }

  // Render results
  function renderResults(data, resultsContainer) {
    const { results, query_understanding } = data;

    let html = "";

    // Show parsed constraints if any
    if (query_understanding && Object.values(query_understanding).some(v => v)) {
      const constraints = [];
      if (query_understanding.budget_max) constraints.push(`Under $${query_understanding.budget_max}`);
      if (query_understanding.category) constraints.push(query_understanding.category);
      if (query_understanding.color) constraints.push(query_understanding.color);
      if (query_understanding.style) constraints.push(query_understanding.style);

      if (constraints.length > 0) {
        html += `
          <div class="sift-search-constraints">
            ${constraints.map(c => `<span class="sift-search-constraint-tag">${c}</span>`).join("")}
          </div>
        `;
      }
    }

    if (results.length === 0) {
      html += `
        <div class="sift-search-no-results">
          No products found. Try a different search.
        </div>
      `;
    } else {
      results.forEach((product) => {
        const imageUrl = product.image_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' fill='%23e5e7eb'%3E%3Crect width='48' height='48'/%3E%3C/svg%3E";
        const price = typeof product.price === "number" ? product.price.toFixed(2) : product.price;
        const link = product.permalink || "#";

        html += `
          <a href="${link}" class="sift-search-result" data-product-id="${product.product_id}">
            <img src="${imageUrl}" alt="${product.name}" class="sift-search-result-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'48\\' height=\\'48\\' fill=\\'%23e5e7eb\\'%3E%3Crect width=\\'48\\' height=\\'48\\'/%3E%3C/svg%3E'"/>
            <div class="sift-search-result-info">
              <div class="sift-search-result-name">${product.name}</div>
              <div class="sift-search-result-price">$${price}</div>
            </div>
          </a>
        `;
      });
    }

    html += `
      <div class="sift-search-powered">
        Powered by <a href="https://sift.ai" target="_blank">Sift AI</a>
      </div>
    `;

    resultsContainer.innerHTML = html;
    resultsContainer.classList.add("active");

    // Add click tracking
    resultsContainer.querySelectorAll(".sift-search-result").forEach((el) => {
      el.addEventListener("click", () => {
        const productId = el.getAttribute("data-product-id");
        trackClick(productId);
      });
    });
  }

  // Track click
  async function trackClick(productId) {
    if (!currentSearchEventId) return;

    try {
      await fetch(`${config.apiUrl}/search/track-click`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          search_event_id: currentSearchEventId,
          product_id: productId,
          tenant_id: config.tenantId,
        }),
      });
    } catch (error) {
      console.error("Click tracking failed:", error);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
