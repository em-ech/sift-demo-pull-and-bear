"""
Embedding Text Builder
Creates deterministic "product card text" for embedding generation.
"""

from app.schemas.product import ProductNormalized, ExtractedAttribute, ProductEnriched


class EmbeddingTextBuilder:
    """
    Builds deterministic embedding text from product data.

    The embedding text is a structured representation that captures
    all searchable aspects of a product in a consistent format.
    """

    def build(
        self,
        product: ProductNormalized,
        attributes: list[ExtractedAttribute] = None,
    ) -> str:
        """
        Build embedding text for a single product.

        Format:
        [Product Name]
        Brand: [brand]
        Category: [categories]
        Description: [clean description]
        Attributes: [color: blue, material: cotton, ...]
        Price: [price range indicator]
        """
        parts = []

        # Product name (most important)
        parts.append(product.name)

        # Brand (if available)
        if product.brand:
            parts.append(f"Brand: {product.brand}")

        # Categories
        if product.categories:
            parts.append(f"Category: {', '.join(product.categories)}")

        # Tags
        if product.tags:
            parts.append(f"Tags: {', '.join(product.tags[:5])}")  # Limit tags

        # Description (use clean version, truncate if needed)
        description = product.description_clean or product.short_description_clean
        if description:
            # Truncate to ~500 chars for embedding efficiency
            if len(description) > 500:
                description = description[:500] + "..."
            parts.append(f"Description: {description}")

        # Extracted attributes (only confident ones)
        if attributes:
            attr_strings = [f"{a.name}: {a.value}" for a in attributes]
            if attr_strings:
                parts.append(f"Attributes: {', '.join(attr_strings)}")

        # Price indicator (helps with "affordable", "premium" searches)
        if product.price:
            price_tier = self._get_price_tier(product.price)
            parts.append(f"Price tier: {price_tier}")

        # Stock status
        if product.stock_status:
            parts.append(f"Availability: {product.stock_status.value}")

        return "\n".join(parts)

    def build_enriched(self, product: ProductNormalized, attributes: list[ExtractedAttribute]) -> ProductEnriched:
        """Build ProductEnriched with embedding text."""
        embedding_text = self.build(product, attributes)

        return ProductEnriched(
            **product.model_dump(),
            attributes=attributes,
            embedding_text=embedding_text,
        )

    def build_batch(
        self,
        products: list[ProductNormalized],
        attributes_map: dict[str, list[ExtractedAttribute]] = None,
    ) -> list[ProductEnriched]:
        """
        Build embedding text for multiple products.

        Args:
            products: List of normalized products
            attributes_map: Dict mapping product_id -> list of attributes
        """
        attributes_map = attributes_map or {}

        return [
            self.build_enriched(p, attributes_map.get(p.id, []))
            for p in products
        ]

    def _get_price_tier(self, price: float) -> str:
        """Convert price to a searchable tier."""
        if price <= 0:
            return "unpriced"
        elif price < 25:
            return "budget-friendly"
        elif price < 50:
            return "affordable"
        elif price < 100:
            return "mid-range"
        elif price < 250:
            return "premium"
        else:
            return "luxury"


# Singleton instance
embedding_builder = EmbeddingTextBuilder()
