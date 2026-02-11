"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { siftChat, type ChatMessage, type SiftSearchResult } from "@/lib/api";

interface ChatPanelProps {
  onProductsFound?: (products: SiftSearchResult[]) => void;
}

interface Message extends ChatMessage {
  products?: SiftSearchResult[];
  isLoading?: boolean;
}

export function ChatPanel({ onProductsFound }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hey! I'm your Pull & Bear style assistant. Ask me about our collection — T-shirts, hoodies, jackets, trousers, or help finding the perfect look.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", isLoading: true },
    ]);
    setIsLoading(true);

    try {
      const history: ChatMessage[] = messages
        .filter((m) => !m.isLoading)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await siftChat(userMessage, history);

      setMessages((prev) => [
        ...prev.filter((m) => !m.isLoading),
        {
          role: "assistant",
          content: response.response,
          products: response.products,
        },
      ]);

      if (onProductsFound && response.products.length > 0) {
        onProductsFound(response.products);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev.filter((m) => !m.isLoading),
        {
          role: "assistant",
          content:
            "Sorry, I'm having trouble connecting. Please make sure the backend server is running on http://localhost:8000",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedQuestions = [
    "What hoodies do you have?",
    "Something for a night out",
    "Streetwear under $30",
    "Show me licensed band tees",
  ];

  return (
    <div className="flex flex-col h-[500px] bg-white border border-[var(--color-border)] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black flex items-center justify-center">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-[0.08em] uppercase">
              <span style={{ color: "#2e69c7" }}>Sift</span>Chat Assistant
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)] tracking-wide">
              Powered by RAG &mdash; Real products only
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[80%] ${
                message.role === "user"
                  ? "bg-black text-white"
                  : "bg-[var(--color-background-alt)]"
              } px-4 py-3`}
            >
              {message.isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-[var(--color-text-muted)] rounded-full animate-bounce" />
                    <span
                      className="w-1.5 h-1.5 bg-[var(--color-text-muted)] rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <span
                      className="w-1.5 h-1.5 bg-[var(--color-text-muted)] rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>

                  {message.products && message.products.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                      <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-[var(--color-text-muted)] mb-2">
                        Recommended:
                      </p>
                      <div className="space-y-2">
                        {message.products.slice(0, 3).map((product) => (
                          <Link
                            key={product.id}
                            href={`/product/${product.id}`}
                            className="flex items-center gap-3 p-2 bg-white border border-[var(--color-border)] hover:border-black transition-colors"
                          >
                            {product.image_url && (
                              <div className="relative w-10 h-14 flex-shrink-0">
                                <Image
                                  src={product.image_url}
                                  alt={product.name}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {product.name}
                              </p>
                              <p className="text-xs text-[var(--color-text-muted)]">
                                $
                                {typeof product.price === "number"
                                  ? product.price.toFixed(2)
                                  : parseFloat(String(product.price)).toFixed(2)}
                              </p>
                            </div>
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {Math.round(product.score * 100)}%
                            </span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Suggested Questions */}
      {messages.length <= 1 && (
        <div className="px-5 pb-3">
          <p className="text-[10px] tracking-[0.1em] uppercase text-[var(--color-text-muted)] mb-2">
            Try asking:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="text-[10px] tracking-wide px-3 py-1.5 border border-[var(--color-border)] hover:border-black transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-[var(--color-border)]"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about styles, outfits, recommendations..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 border border-[var(--color-border)] focus:border-black focus:outline-none text-xs disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-5 py-3 bg-black text-white hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
