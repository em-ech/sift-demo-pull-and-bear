/**
 * Sift Retail AI - Chat Widget
 *
 * Embeddable AI shopping assistant chat widget.
 *
 * Usage:
 * <script
 *   src="https://your-domain/sift-chat-widget.js"
 *   data-api-key="sk_live_..."
 *   data-tenant-id="your-tenant"
 *   data-store-name="Your Store"
 *   data-position="bottom-right"
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
    storeName: currentScript?.getAttribute("data-store-name") || "our store",
    apiUrl: currentScript?.getAttribute("data-api-url") || "http://localhost:8000",
    position: currentScript?.getAttribute("data-position") || "bottom-right",
    theme: currentScript?.getAttribute("data-theme") || "light",
    greeting: currentScript?.getAttribute("data-greeting") || "Hi! I'm your AI shopping assistant. How can I help you today?",
    primaryColor: currentScript?.getAttribute("data-primary-color") || "#000000",
  };

  // Generate session ID
  const sessionId = "chat_" + Math.random().toString(36).substring(2, 15);
  let chatHistory = [];

  // Position styles
  const positionStyles = {
    "bottom-right": "bottom: 20px; right: 20px;",
    "bottom-left": "bottom: 20px; left: 20px;",
  };

  // Styles
  const styles = `
    .sift-chat-widget {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      position: fixed;
      ${positionStyles[config.position] || positionStyles["bottom-right"]}
      z-index: 10000;
    }

    .sift-chat-button {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${config.primaryColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .sift-chat-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .sift-chat-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    .sift-chat-window {
      position: absolute;
      bottom: 70px;
      ${config.position.includes("right") ? "right: 0" : "left: 0"};
      width: 380px;
      height: 500px;
      background: ${config.theme === "dark" ? "#1f2937" : "#ffffff"};
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
    }

    .sift-chat-window.active {
      display: flex;
    }

    .sift-chat-header {
      padding: 16px;
      background: ${config.primaryColor};
      color: white;
    }

    .sift-chat-header-title {
      font-weight: 600;
      font-size: 16px;
      margin-bottom: 2px;
    }

    .sift-chat-header-subtitle {
      font-size: 12px;
      opacity: 0.9;
    }

    .sift-chat-close {
      position: absolute;
      top: 12px;
      right: 12px;
      background: transparent;
      border: none;
      color: white;
      cursor: pointer;
      padding: 4px;
      opacity: 0.8;
      transition: opacity 0.2s;
    }

    .sift-chat-close:hover {
      opacity: 1;
    }

    .sift-chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sift-chat-message {
      max-width: 85%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
    }

    .sift-chat-message.user {
      align-self: flex-end;
      background: ${config.primaryColor};
      color: white;
      border-bottom-right-radius: 4px;
    }

    .sift-chat-message.assistant {
      align-self: flex-start;
      background: ${config.theme === "dark" ? "#374151" : "#f3f4f6"};
      color: ${config.theme === "dark" ? "#ffffff" : "#1f2937"};
      border-bottom-left-radius: 4px;
    }

    .sift-chat-products {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 8px 0;
      margin-top: 8px;
    }

    .sift-chat-product {
      flex-shrink: 0;
      width: 120px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
      text-decoration: none;
      color: inherit;
      transition: box-shadow 0.2s;
    }

    .sift-chat-product:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .sift-chat-product-image {
      width: 100%;
      height: 80px;
      object-fit: cover;
      background: #f3f4f6;
    }

    .sift-chat-product-info {
      padding: 8px;
    }

    .sift-chat-product-name {
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #1f2937;
    }

    .sift-chat-product-price {
      font-size: 11px;
      color: #6b7280;
      margin-top: 2px;
    }

    .sift-chat-input-wrapper {
      padding: 12px;
      border-top: 1px solid ${config.theme === "dark" ? "#374151" : "#e5e7eb"};
      display: flex;
      gap: 8px;
    }

    .sift-chat-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid ${config.theme === "dark" ? "#374151" : "#e5e7eb"};
      border-radius: 24px;
      font-size: 14px;
      outline: none;
      background: ${config.theme === "dark" ? "#374151" : "#ffffff"};
      color: ${config.theme === "dark" ? "#ffffff" : "#1f2937"};
    }

    .sift-chat-input:focus {
      border-color: ${config.primaryColor};
    }

    .sift-chat-send {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${config.primaryColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: opacity 0.2s;
    }

    .sift-chat-send:hover {
      opacity: 0.9;
    }

    .sift-chat-send:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .sift-chat-send svg {
      width: 18px;
      height: 18px;
      fill: white;
    }

    .sift-chat-typing {
      display: flex;
      gap: 4px;
      padding: 10px 14px;
      background: ${config.theme === "dark" ? "#374151" : "#f3f4f6"};
      border-radius: 16px;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }

    .sift-chat-typing-dot {
      width: 8px;
      height: 8px;
      background: #9ca3af;
      border-radius: 50%;
      animation: sift-typing 1.4s ease-in-out infinite;
    }

    .sift-chat-typing-dot:nth-child(2) {
      animation-delay: 0.2s;
    }

    .sift-chat-typing-dot:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes sift-typing {
      0%, 60%, 100% { transform: translateY(0); }
      30% { transform: translateY(-4px); }
    }

    .sift-chat-powered {
      padding: 6px;
      text-align: center;
      font-size: 10px;
      color: #9ca3af;
      border-top: 1px solid ${config.theme === "dark" ? "#374151" : "#f3f4f6"};
    }

    .sift-chat-powered a {
      color: #6b7280;
      text-decoration: none;
    }

    @media (max-width: 480px) {
      .sift-chat-window {
        width: calc(100vw - 32px);
        height: 60vh;
        bottom: 70px;
        ${config.position.includes("right") ? "right: 16px" : "left: 16px"};
      }
    }
  `;

  // Inject styles
  const styleSheet = document.createElement("style");
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);

  // Create widget HTML
  function createWidget() {
    const widget = document.createElement("div");
    widget.className = "sift-chat-widget";
    widget.innerHTML = `
      <div class="sift-chat-window">
        <div class="sift-chat-header">
          <div class="sift-chat-header-title">AI Shopping Assistant</div>
          <div class="sift-chat-header-subtitle">Powered by ${config.storeName}</div>
          <button class="sift-chat-close">
            <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
        <div class="sift-chat-messages"></div>
        <div class="sift-chat-input-wrapper">
          <input type="text" class="sift-chat-input" placeholder="Ask about products..." />
          <button class="sift-chat-send">
            <svg viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          </button>
        </div>
        <div class="sift-chat-powered">
          Powered by <a href="https://sift.ai" target="_blank">Sift AI</a>
        </div>
      </div>
      <button class="sift-chat-button">
        <svg viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
          <path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/>
        </svg>
      </button>
    `;

    document.body.appendChild(widget);

    // Get elements
    const chatButton = widget.querySelector(".sift-chat-button");
    const chatWindow = widget.querySelector(".sift-chat-window");
    const closeButton = widget.querySelector(".sift-chat-close");
    const messagesContainer = widget.querySelector(".sift-chat-messages");
    const input = widget.querySelector(".sift-chat-input");
    const sendButton = widget.querySelector(".sift-chat-send");

    // Toggle chat
    chatButton.addEventListener("click", () => {
      chatWindow.classList.toggle("active");
      if (chatWindow.classList.contains("active") && messagesContainer.children.length === 0) {
        // Show greeting
        addMessage(config.greeting, "assistant");
      }
    });

    closeButton.addEventListener("click", () => {
      chatWindow.classList.remove("active");
    });

    // Send message
    const sendMessage = async () => {
      const message = input.value.trim();
      if (!message) return;

      input.value = "";
      addMessage(message, "user");

      // Show typing indicator
      const typingEl = addTypingIndicator();

      try {
        const response = await fetch(`${config.apiUrl}/chat/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: message,
            tenant_id: config.tenantId,
            store_name: config.storeName,
            history: chatHistory.slice(-10), // Last 10 messages for context
            session_id: sessionId,
          }),
        });

        if (!response.ok) throw new Error("Chat failed");

        const data = await response.json();

        // Remove typing indicator
        typingEl.remove();

        // Add response
        addMessage(data.response, "assistant", data.products);

        // Update history
        chatHistory.push({ role: "user", content: message });
        chatHistory.push({ role: "assistant", content: data.response });

      } catch (error) {
        console.error("Chat error:", error);
        typingEl.remove();
        addMessage("Sorry, I'm having trouble connecting. Please try again.", "assistant");
      }
    };

    sendButton.addEventListener("click", sendMessage);
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") sendMessage();
    });

    // Add message to chat
    function addMessage(content, role, products = []) {
      const messageEl = document.createElement("div");
      messageEl.className = `sift-chat-message ${role}`;

      let html = content;

      if (products && products.length > 0) {
        html += `<div class="sift-chat-products">`;
        products.forEach((product) => {
          const imageUrl = product.image_url || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='80' fill='%23e5e7eb'%3E%3Crect width='120' height='80'/%3E%3C/svg%3E";
          const price = typeof product.price === "number" ? product.price.toFixed(2) : product.price;
          const link = product.permalink || "#";

          html += `
            <a href="${link}" class="sift-chat-product" target="_blank">
              <img src="${imageUrl}" alt="${product.name}" class="sift-chat-product-image" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'120\\' height=\\'80\\' fill=\\'%23e5e7eb\\'%3E%3Crect width=\\'120\\' height=\\'80\\'/%3E%3C/svg%3E'"/>
              <div class="sift-chat-product-info">
                <div class="sift-chat-product-name">${product.name}</div>
                <div class="sift-chat-product-price">$${price}</div>
              </div>
            </a>
          `;
        });
        html += `</div>`;
      }

      messageEl.innerHTML = html;
      messagesContainer.appendChild(messageEl);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Add typing indicator
    function addTypingIndicator() {
      const typingEl = document.createElement("div");
      typingEl.className = "sift-chat-typing";
      typingEl.innerHTML = `
        <div class="sift-chat-typing-dot"></div>
        <div class="sift-chat-typing-dot"></div>
        <div class="sift-chat-typing-dot"></div>
      `;
      messagesContainer.appendChild(typingEl);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return typingEl;
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();
