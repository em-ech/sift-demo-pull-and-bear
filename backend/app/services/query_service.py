"""
Query Understanding Service
Extracts structured constraints from natural language queries.
"""

import json
import time
from typing import Optional
from dataclasses import dataclass
from openai import OpenAI

from app.core.config import settings


QUERY_UNDERSTANDING_PROMPT = """You are a search query analyzer for a retail product search engine. Given a user's natural language query, extract structured constraints.

RULES:
1. Only extract constraints that are EXPLICITLY stated or strongly implied
2. If unsure about a constraint, do NOT include it
3. Return ONLY valid JSON, no explanation

User Query: {query}

Extract these constraints (only if present):
- budget_max: maximum price in USD (number or null)
- budget_min: minimum price in USD (number or null)
- category: product category if mentioned (string or null)
- brand: specific brand if mentioned (string or null)
- color: color preference if mentioned (string or null)
- material: material preference if mentioned (string or null)
- style: style preference (casual, formal, etc.) (string or null)
- occasion: occasion if mentioned (party, work, etc.) (string or null)
- gender: target gender if mentioned (men, women, unisex, kids) (string or null)
- search_intent: the core search intent without constraints (string)

Examples:
- "blue dress under $50" -> {{"budget_max": 50, "color": "blue", "category": "dress", "search_intent": "dress"}}
- "comfortable running shoes" -> {{"category": "shoes", "style": "athletic", "search_intent": "comfortable running shoes"}}
- "gift for mom" -> {{"occasion": "gift", "search_intent": "gift for mom"}}

Return JSON:
"""


@dataclass
class QueryConstraints:
    """Extracted constraints from a search query."""
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    color: Optional[str] = None
    material: Optional[str] = None
    style: Optional[str] = None
    occasion: Optional[str] = None
    gender: Optional[str] = None
    search_intent: str = ""

    def has_filters(self) -> bool:
        """Check if any filterable constraints are present."""
        return any([
            self.budget_min,
            self.budget_max,
            self.category,
            self.brand,
            self.color,
            self.material,
            self.style,
            self.gender,
        ])

    def to_qdrant_filters(self) -> list[dict]:
        """Convert constraints to Qdrant filter conditions."""
        filters = []

        if self.budget_max:
            filters.append({
                "key": "price",
                "range": {"lte": self.budget_max}
            })

        if self.budget_min:
            filters.append({
                "key": "price",
                "range": {"gte": self.budget_min}
            })

        # For text fields, we'd use Match conditions
        # Note: These require payload indexes in Qdrant
        if self.category:
            filters.append({
                "key": "categories",
                "match": {"any": [self.category.lower()]}
            })

        if self.brand:
            filters.append({
                "key": "brand",
                "match": {"value": self.brand.lower()}
            })

        return filters

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "budget_min": self.budget_min,
            "budget_max": self.budget_max,
            "category": self.category,
            "brand": self.brand,
            "color": self.color,
            "material": self.material,
            "style": self.style,
            "occasion": self.occasion,
            "gender": self.gender,
            "search_intent": self.search_intent,
        }


@dataclass
class QueryResult:
    """Result of query understanding."""
    original_query: str
    constraints: QueryConstraints
    embedding_query: str  # The query to embed (could be modified)
    latency_ms: int


class QueryService:
    """Understands and processes search queries."""

    def __init__(self, use_llm: bool = True):
        self.use_llm = use_llm
        if settings.OPENAI_API_KEY:
            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
        else:
            self.client = None

    def understand(self, query: str) -> QueryResult:
        """
        Parse a natural language query and extract constraints.

        Returns QueryResult with:
        - Original query
        - Extracted constraints
        - Query to use for embedding (the search_intent)
        - Processing latency
        """
        start_time = time.time()

        # Clean query
        query = query.strip()

        # If LLM is disabled or unavailable, use simple parsing
        if not self.use_llm or not self.client:
            constraints = self._simple_parse(query)
        else:
            constraints = self._llm_parse(query)

        # Use search_intent for embedding if extracted, otherwise original query
        embedding_query = constraints.search_intent or query

        latency_ms = int((time.time() - start_time) * 1000)

        return QueryResult(
            original_query=query,
            constraints=constraints,
            embedding_query=embedding_query,
            latency_ms=latency_ms,
        )

    def _llm_parse(self, query: str) -> QueryConstraints:
        """Use LLM to extract constraints from query."""
        try:
            response = self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You extract search constraints from queries. Return only JSON."},
                    {"role": "user", "content": QUERY_UNDERSTANDING_PROMPT.format(query=query)},
                ],
                temperature=0.1,
                max_tokens=300,
                response_format={"type": "json_object"},
            )

            content = response.choices[0].message.content
            data = json.loads(content)

            return QueryConstraints(
                budget_min=data.get("budget_min"),
                budget_max=data.get("budget_max"),
                category=data.get("category"),
                brand=data.get("brand"),
                color=data.get("color"),
                material=data.get("material"),
                style=data.get("style"),
                occasion=data.get("occasion"),
                gender=data.get("gender"),
                search_intent=data.get("search_intent", query),
            )

        except Exception as e:
            print(f"LLM query parsing failed: {e}")
            return self._simple_parse(query)

    def _simple_parse(self, query: str) -> QueryConstraints:
        """Simple rule-based query parsing (fast, no LLM)."""
        constraints = QueryConstraints(search_intent=query)
        query_lower = query.lower()

        # Budget extraction
        import re

        # "under $50", "less than 50", "below $100"
        under_match = re.search(r'(?:under|less than|below|max|<)\s*\$?(\d+)', query_lower)
        if under_match:
            constraints.budget_max = float(under_match.group(1))

        # "over $50", "more than 50", "above $100"
        over_match = re.search(r'(?:over|more than|above|min|>)\s*\$?(\d+)', query_lower)
        if over_match:
            constraints.budget_min = float(over_match.group(1))

        # "$50-$100", "$50 to $100"
        range_match = re.search(r'\$?(\d+)\s*(?:-|to)\s*\$?(\d+)', query_lower)
        if range_match:
            constraints.budget_min = float(range_match.group(1))
            constraints.budget_max = float(range_match.group(2))

        # Gender
        if any(w in query_lower for w in ["women", "womens", "woman", "ladies", "her", "girlfriend", "wife"]):
            constraints.gender = "women"
        elif any(w in query_lower for w in ["men", "mens", "man", "guys", "him", "boyfriend", "husband"]):
            constraints.gender = "men"
        elif any(w in query_lower for w in ["kids", "children", "child", "boys", "girls"]):
            constraints.gender = "kids"

        # Common categories
        categories = ["shoes", "dress", "shirt", "pants", "jacket", "bag", "watch", "jewelry"]
        for cat in categories:
            if cat in query_lower:
                constraints.category = cat
                break

        # Colors
        colors = ["red", "blue", "green", "black", "white", "pink", "yellow", "purple", "orange", "brown", "gray", "navy", "beige"]
        for color in colors:
            if color in query_lower:
                constraints.color = color
                break

        return constraints


# Singleton instance
query_service = QueryService(use_llm=True)
