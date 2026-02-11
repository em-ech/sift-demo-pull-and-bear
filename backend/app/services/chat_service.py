"""
Chat Service
Handles the RAG (Retrieval-Augmented Generation) pipeline.
Zero-hallucination: The LLM can ONLY reference retrieved products.
Includes product data sanitization to prevent product-based injection.
"""

from openai import AsyncOpenAI
from app.core.config import settings
from app.services.vector_service import vector_service
from app.services.db_service import db_service
from app.core.security import sanitizer


SYSTEM_PROMPT = """You are a friendly shopping assistant for {store_name}.

RULES:
1. You can ONLY recommend products from the provided list.
2. If no products match, say "I don't have anything that matches that right now."
3. NEVER make up products, prices, or features.

RESPONSE FORMAT — THIS IS CRITICAL:
- The UI will automatically display product cards (with names, prices, images, and links) directly below your text. You must NOT duplicate that information.
- NEVER include product names, prices, descriptions, URLs, links, or numbered/bulleted lists of products in your text.
- Your response must ONLY have two parts:
  1. An opening line — a friendly, contextual intro acknowledging what the customer asked for (e.g. "I found some great band tees for you under $30!")
  2. A closing line — a brief follow-up after the product cards will appear (e.g. "Let me know if you'd like to see more options or something different!")
- Keep it to exactly 2 short sentences. Nothing more.

AVAILABLE PRODUCTS (for your context only — do NOT list these in your response):
{products}

If the products list is empty or none match, politely let the customer know and suggest they try something else."""


class ChatService:
    def __init__(self):
        self.openai = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    def format_products_for_prompt(self, products: list[dict]) -> str:
        """
        Format retrieved products for the LLM prompt.

        IMPORTANT: Products are sanitized to prevent product-based injection attacks.
        A malicious product name/description could contain prompt manipulation attempts.
        """
        if not products:
            return "No products found matching this query."

        formatted = []
        for i, p in enumerate(products, 1):
            # Sanitize product data to prevent injection via product names/descriptions
            safe_product = sanitizer.sanitize_product_data(p)

            permalink = safe_product.get('permalink', '') or ''
            link_line = f"   Link: {permalink}\n" if permalink else ""

            formatted.append(
                f"{i}. {safe_product.get('name', 'Unknown')}\n"
                f"   Price: ${safe_product.get('price', 0)}\n"
                f"   Description: {safe_product.get('description', 'N/A')}\n"
                f"   Categories: {', '.join(safe_product.get('categories', [])) if safe_product.get('categories') else 'N/A'}\n"
                f"{link_line}"
                f"   In Stock: {safe_product.get('stock_status', 'unknown') == 'instock'}"
            )
        return "\n\n".join(formatted)

    async def chat(
        self,
        query: str,
        tenant_id: str,
        store_name: str = "our store",
        conversation_history: list[dict] = None,
        session_id: str = None,
    ) -> dict:
        """
        Main RAG pipeline:
        1. Convert query to vector
        2. Search for relevant products (with tenant filter)
        3. Generate response using only retrieved products
        """
        # Step 1 & 2: Retrieve relevant products (security filter applied)
        products = vector_service.search(
            query=query,
            tenant_id=tenant_id,
            top_k=5,
            score_threshold=0.4,
        )

        # Log the search for analytics
        try:
            db_service.log_search(
                tenant_id=tenant_id,
                query=query,
                results_count=len(products),
                session_id=session_id,
            )
        except Exception:
            pass  # Don't fail chat if logging fails

        # Step 3: Build the prompt with product context (for relevance) but instruct LLM not to list them
        products_text = self.format_products_for_prompt(products)
        system_prompt = SYSTEM_PROMPT.format(
            store_name=store_name,
            products=products_text,
        )

        # Build messages
        messages = [{"role": "system", "content": system_prompt}]

        # Add conversation history if provided
        if conversation_history:
            messages.extend(conversation_history[-10:])  # Last 10 messages

        # Add current query
        messages.append({"role": "user", "content": query})

        # Generate response (async)
        response = await self.openai.chat.completions.create(
            model=settings.CHAT_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=500,
        )

        assistant_message = response.choices[0].message.content

        return {
            "response": assistant_message,
            "products": products,
            "products_count": len(products),
        }


# Singleton instance
chat_service = ChatService()
