"""
Product Normalizer
Cleans and normalizes raw product data.
"""

import re
import html
from typing import Optional
from decimal import Decimal, InvalidOperation

from app.schemas.product import ProductRaw, ProductNormalized, StockStatus


class ProductNormalizer:
    """Normalizes raw product data into a consistent format."""

    # Common currency symbols to strip
    CURRENCY_SYMBOLS = ["$", "USD", "EUR", "GBP", "CAD", "AUD"]

    # HTML tag pattern
    HTML_PATTERN = re.compile(r"<[^>]+>")

    # Multiple whitespace pattern
    WHITESPACE_PATTERN = re.compile(r"\s+")

    def normalize(
        self,
        raw: ProductRaw,
        tenant_id: str,
        connector_id: Optional[str] = None,
    ) -> ProductNormalized:
        """
        Normalize a raw product.

        Steps:
        1. Clean HTML from text fields
        2. Normalize prices (extract numbers, handle currency)
        3. Normalize stock status
        4. Generate slug from name
        5. Trim and clean all strings
        """
        # Clean text fields
        description_clean = self._clean_text(raw.description or "")
        short_description_clean = self._clean_text(raw.short_description or "")

        # If short_description is empty, take first 200 chars of description
        if not short_description_clean and description_clean:
            short_description_clean = description_clean[:200]
            if len(description_clean) > 200:
                short_description_clean += "..."

        # Normalize prices
        price = self._normalize_price(raw.price)
        regular_price = self._normalize_price(raw.regular_price) or price
        sale_price = self._normalize_price(raw.sale_price)

        # Generate slug
        slug = self._generate_slug(raw.name)

        # Normalize categories (clean and dedupe)
        categories = self._normalize_list(raw.categories)
        tags = self._normalize_list(raw.tags)

        # Normalize stock status
        stock_status = self._normalize_stock_status(raw.stock_status)

        return ProductNormalized(
            id=raw.id,
            tenant_id=tenant_id,
            connector_id=connector_id,
            name=self._clean_text(raw.name),
            slug=slug,
            description=raw.description or "",
            short_description=raw.short_description or short_description_clean,
            description_clean=description_clean,
            short_description_clean=short_description_clean,
            price=price,
            regular_price=regular_price,
            sale_price=sale_price,
            currency=raw.currency.upper() if raw.currency else "USD",
            sku=raw.sku or "",
            brand=self._clean_text(raw.brand or ""),
            categories=categories,
            tags=tags,
            image_url=raw.image_url,
            gallery_urls=raw.gallery_urls or [],
            permalink=raw.permalink or "",
            stock_status=stock_status,
            stock_quantity=raw.stock_quantity,
            raw_data=raw.raw_data,
        )

    def normalize_batch(
        self,
        products: list[ProductRaw],
        tenant_id: str,
        connector_id: Optional[str] = None,
    ) -> list[ProductNormalized]:
        """Normalize a batch of products."""
        return [
            self.normalize(p, tenant_id, connector_id)
            for p in products
        ]

    def _clean_text(self, text: str) -> str:
        """Remove HTML tags and normalize whitespace."""
        if not text:
            return ""

        # Decode HTML entities
        text = html.unescape(text)

        # Remove HTML tags
        text = self.HTML_PATTERN.sub(" ", text)

        # Normalize whitespace
        text = self.WHITESPACE_PATTERN.sub(" ", text)

        return text.strip()

    def _normalize_price(self, price: Optional[float | str]) -> float:
        """Extract numeric price from various formats."""
        if price is None:
            return 0.0

        if isinstance(price, (int, float)):
            return float(price)

        if isinstance(price, str):
            # Remove currency symbols and whitespace
            clean = price.strip()
            for symbol in self.CURRENCY_SYMBOLS:
                clean = clean.replace(symbol, "")
            clean = clean.replace(",", "").strip()

            try:
                return float(Decimal(clean))
            except (InvalidOperation, ValueError):
                return 0.0

        return 0.0

    def _generate_slug(self, name: str) -> str:
        """Generate URL-friendly slug from name."""
        if not name:
            return ""

        # Lowercase
        slug = name.lower()

        # Replace spaces and special chars with hyphens
        slug = re.sub(r"[^a-z0-9]+", "-", slug)

        # Remove leading/trailing hyphens
        slug = slug.strip("-")

        # Collapse multiple hyphens
        slug = re.sub(r"-+", "-", slug)

        return slug

    def _normalize_list(self, items: list[str]) -> list[str]:
        """Clean and dedupe a list of strings."""
        if not items:
            return []

        cleaned = []
        seen = set()

        for item in items:
            if not item:
                continue
            clean = self._clean_text(str(item))
            if clean and clean.lower() not in seen:
                cleaned.append(clean)
                seen.add(clean.lower())

        return cleaned

    def _normalize_stock_status(self, status: StockStatus | str) -> StockStatus:
        """Normalize stock status to enum value."""
        if isinstance(status, StockStatus):
            return status

        if not status:
            return StockStatus.IN_STOCK

        status_lower = str(status).lower().strip()

        if status_lower in ("instock", "in_stock", "in stock", "available", "true", "1"):
            return StockStatus.IN_STOCK
        elif status_lower in ("outofstock", "out_of_stock", "out of stock", "unavailable", "false", "0"):
            return StockStatus.OUT_OF_STOCK
        elif status_lower in ("onbackorder", "on_backorder", "backorder", "preorder"):
            return StockStatus.ON_BACKORDER

        return StockStatus.IN_STOCK


# Singleton instance
normalizer = ProductNormalizer()
