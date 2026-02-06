"""
Attribute Extractor
LLM-based extraction of structured attributes from product data.
Uses strict JSON output with confidence scores.
"""

import json
from typing import Optional
from openai import OpenAI

from app.core.config import settings
from app.schemas.product import ProductNormalized, ExtractedAttribute


# Attributes we want to extract
EXTRACTABLE_ATTRIBUTES = [
    "color",
    "material",
    "style",
    "occasion",
    "season",
    "fit",
    "size_type",
    "pattern",
    "gender",
    "age_group",
]

EXTRACTION_PROMPT = """You are a product attribute extractor. Given a product's name and description, extract structured attributes.

RULES:
1. Only extract attributes you are confident about (confidence >= 0.7)
2. If unsure, do NOT include the attribute
3. Use simple, lowercase values (e.g., "blue" not "Navy Blue")
4. For multi-value attributes like color, pick the PRIMARY one
5. Return ONLY valid JSON, no markdown or explanation

Product Name: {name}
Product Description: {description}
Categories: {categories}
Brand: {brand}

Extract these attributes (only if confident):
- color: primary color of the product
- material: main material (cotton, leather, silk, etc.)
- style: style category (casual, formal, bohemian, minimalist, etc.)
- occasion: when to use (everyday, party, wedding, work, sport, etc.)
- season: seasonality (spring, summer, fall, winter, all-season)
- fit: fit type for clothing (slim, regular, loose, oversized)
- size_type: sizing category (petite, regular, plus, tall)
- pattern: pattern type (solid, striped, floral, geometric, etc.)
- gender: target gender (men, women, unisex, kids)
- age_group: target age (baby, kids, teens, adults, seniors)

Return JSON in this exact format:
{
  "attributes": [
    {"name": "color", "value": "blue", "confidence": 0.95},
    {"name": "material", "value": "cotton", "confidence": 0.85}
  ]
}

If no attributes can be confidently extracted, return:
{"attributes": []}
"""


class AttributeExtractor:
    """Extracts structured attributes from product data using LLM."""

    def __init__(self, confidence_threshold: float = 0.7):
        self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        self.confidence_threshold = confidence_threshold
        self.model = "gpt-4o-mini"  # Fast and cheap for extraction

    def extract(self, product: ProductNormalized) -> list[ExtractedAttribute]:
        """
        Extract attributes from a single product.
        Returns only attributes above the confidence threshold.
        """
        if not settings.OPENAI_API_KEY:
            return []

        # Build context for extraction
        description = product.description_clean or product.short_description_clean
        if not description and not product.name:
            return []

        prompt = EXTRACTION_PROMPT.format(
            name=product.name,
            description=description[:1000],  # Limit description length
            categories=", ".join(product.categories) if product.categories else "N/A",
            brand=product.brand or "N/A",
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a product attribute extractor. Return only valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.1,  # Low temperature for consistency
                max_tokens=500,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            data = json.loads(content)

            # Parse and filter by confidence
            attributes = []
            for attr in data.get("attributes", []):
                if (
                    attr.get("name") in EXTRACTABLE_ATTRIBUTES
                    and attr.get("confidence", 0) >= self.confidence_threshold
                    and attr.get("value")
                ):
                    attributes.append(ExtractedAttribute(
                        name=attr["name"],
                        value=str(attr["value"]).lower().strip(),
                        confidence=float(attr["confidence"]),
                        source_field="description",
                    ))

            return attributes

        except Exception as e:
            print(f"Attribute extraction failed for product {product.id}: {e}")
            return []

    def extract_batch(
        self,
        products: list[ProductNormalized],
        skip_extraction: bool = False,
    ) -> dict[str, list[ExtractedAttribute]]:
        """
        Extract attributes from multiple products.
        Returns a dict mapping product_id -> list of attributes.

        If skip_extraction is True, returns empty lists (useful for fast ingestion).
        """
        results = {}

        for product in products:
            if skip_extraction:
                results[product.id] = []
            else:
                results[product.id] = self.extract(product)

        return results

    def extract_from_rules(self, product: ProductNormalized) -> list[ExtractedAttribute]:
        """
        Extract attributes using simple rules (faster, no LLM).
        Good for basic extraction or fallback.
        """
        attributes = []
        text = f"{product.name} {product.description_clean}".lower()

        # Color extraction (simple keyword matching)
        colors = ["red", "blue", "green", "black", "white", "pink", "yellow",
                  "purple", "orange", "brown", "gray", "grey", "navy", "beige"]
        for color in colors:
            if color in text:
                attributes.append(ExtractedAttribute(
                    name="color",
                    value=color,
                    confidence=0.7,
                    source_field="description",
                ))
                break  # Only first match

        # Material extraction
        materials = ["cotton", "leather", "silk", "wool", "polyester", "linen",
                     "denim", "velvet", "suede", "nylon", "cashmere"]
        for material in materials:
            if material in text:
                attributes.append(ExtractedAttribute(
                    name="material",
                    value=material,
                    confidence=0.75,
                    source_field="description",
                ))
                break

        # Gender from categories
        cats_lower = " ".join(product.categories).lower()
        if "women" in cats_lower or "womens" in cats_lower:
            attributes.append(ExtractedAttribute(
                name="gender",
                value="women",
                confidence=0.9,
                source_field="categories",
            ))
        elif "men" in cats_lower or "mens" in cats_lower:
            attributes.append(ExtractedAttribute(
                name="gender",
                value="men",
                confidence=0.9,
                source_field="categories",
            ))
        elif "kid" in cats_lower or "child" in cats_lower:
            attributes.append(ExtractedAttribute(
                name="gender",
                value="kids",
                confidence=0.9,
                source_field="categories",
            ))

        return attributes


# Singleton instance
attribute_extractor = AttributeExtractor()
