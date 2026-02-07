"""
Search Routes
Handles semantic search endpoints with tenant isolation and query understanding.
Includes security: injection detection, input sanitization.
"""

import re
import time
import logging
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from app.services.vector_service import vector_service
from app.services.query_service import query_service
from app.services.db_service import db_service
from app.services.rag.retriever import enhanced_retriever
from app.core.config import settings
from app.core.security import injection_detector, sanitizer

router = APIRouter(prefix="/search", tags=["search"])
logger = logging.getLogger(__name__)


# ==================== REQUEST/RESPONSE MODELS ====================


class SearchRequest(BaseModel):
    query: str
    tenant_id: str
    top_k: int = 5
    use_query_understanding: bool = True  # Whether to parse constraints
    session_id: Optional[str] = None
    source: str = "search_bar"  # search_bar, chat, api
    strategy: Optional[str] = None  # Override RAG strategy: fast, validated, full


class SearchResult(BaseModel):
    product_id: str
    name: str
    price: float
    description: Optional[str] = None
    image_url: Optional[str] = None
    permalink: Optional[str] = None
    categories: list[str] = []
    stock_status: str = "instock"
    score: float = 0.0


class SearchResponse(BaseModel):
    results: list[SearchResult]
    count: int
    query_understanding: Optional[dict] = None  # Extracted constraints
    validation_summary: Optional[dict] = None  # From enhanced retriever
    search_event_id: Optional[int] = None  # For click tracking
    strategy_used: Optional[str] = None  # RAG strategy used
    cache_hit: bool = False
    latency_ms: int = 0


class TrackClickRequest(BaseModel):
    search_event_id: int
    product_id: str
    tenant_id: str


# ==================== SEARCH ENDPOINTS ====================


@router.post("/", response_model=SearchResponse)
async def search_products(request: SearchRequest):
    """
    Semantic product search with HARD tenant isolation and security validation.

    Security pipeline:
    1. Check for prompt injection attempts
    2. Sanitize query input
    3. Process search

    Features:
    - Natural language query understanding (extracts budget, category, style, etc.)
    - Semantic vector search
    - Tenant-isolated (no cross-tenant data leakage)
    - Click tracking for analytics

    The tenant_id filter is applied at the database level,
    ensuring zero risk of cross-tenant data leakage.
    """
    start_time = time.time()

    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if not request.tenant_id.strip():
        raise HTTPException(status_code=400, detail="tenant_id is required")

    # Step 1: Check for prompt injection (search queries can also be injection vectors)
    detection = injection_detector.detect(request.query)
    if detection.risk_level == "high":
        logger.warning(
            f"High-risk injection attempt in search for tenant {request.tenant_id}: "
            f"{detection.message}"
        )
        raise HTTPException(
            status_code=400,
            detail="Your search contains invalid content. Please rephrase your query."
        )

    # Step 2: Sanitize the query
    safe_query = sanitizer.sanitize_query(request.query)

    try:
        # Step 3: Query understanding (optional)
        constraints_dict = None
        embedding_query = safe_query

        if request.use_query_understanding:
            query_result = query_service.understand(safe_query)
            constraints_dict = query_result.constraints.to_dict()
            embedding_query = query_result.embedding_query

        # Step 4: Determine if we need extra candidates for post-filtering
        has_filters = constraints_dict and any(
            constraints_dict.get(k)
            for k in ("budget_max", "budget_min", "color", "category", "material", "brand")
        )
        fetch_k = request.top_k * 3 if has_filters else request.top_k

        # Vector search with tenant filter
        raw_results = vector_service.search(
            query=embedding_query,
            tenant_id=request.tenant_id,
            top_k=fetch_k,
        )

        # Step 5: Apply constraint-based filtering
        if constraints_dict and has_filters:
            filtered_results = []
            for r in raw_results:
                # Budget filter
                price = r.get("price", 0)
                if constraints_dict.get("budget_max") and price > constraints_dict["budget_max"]:
                    continue
                if constraints_dict.get("budget_min") and price < constraints_dict["budget_min"]:
                    continue

                # Build a searchable text blob from product fields
                name_lower = (r.get("name") or "").lower()
                desc_lower = (r.get("description") or "").lower()
                product_text = f"{name_lower} {desc_lower}"
                cats_lower = [c.lower() for c in r.get("categories", [])]

                # Category filter
                cat_constraint = (constraints_dict.get("category") or "").lower()
                if cat_constraint:
                    cat_match = (
                        cat_constraint in product_text
                        or any(cat_constraint in c for c in cats_lower)
                        # Handle plural/singular: "hoodie" matches "hoodies"
                        or any(c.startswith(cat_constraint) or cat_constraint.startswith(c) for c in cats_lower)
                    )
                    if not cat_match:
                        continue

                # Color filter (word boundary to avoid "red" matching "coloured")
                color_constraint = (constraints_dict.get("color") or "").lower()
                if color_constraint and not re.search(rf"\b{re.escape(color_constraint)}\b", product_text):
                    continue

                # Material filter (word boundary)
                material_constraint = (constraints_dict.get("material") or "").lower()
                if material_constraint and not re.search(rf"\b{re.escape(material_constraint)}\b", product_text):
                    continue

                # Brand filter (word boundary)
                brand_constraint = (constraints_dict.get("brand") or "").lower()
                if brand_constraint and not re.search(rf"\b{re.escape(brand_constraint)}\b", product_text):
                    continue

                filtered_results.append(r)

            raw_results = filtered_results[:request.top_k]

        # Step 6: Format results with rescaled scores
        # Raw cosine similarity from text-embedding-3-small is typically 0.30-0.70
        # Rescale to 60-99% for a more intuitive match percentage
        def rescale_score(raw: float) -> float:
            floor, ceiling = 0.30, 0.70
            clamped = max(floor, min(ceiling, raw))
            return 0.60 + (clamped - floor) / (ceiling - floor) * 0.39

        results = [
            SearchResult(
                product_id=r["product_id"],
                name=r["name"],
                price=r["price"],
                description=r.get("description"),
                image_url=r.get("image_url"),
                permalink=r.get("permalink"),
                categories=r.get("categories", []),
                stock_status=r.get("stock_status", "instock"),
                score=round(rescale_score(r.get("score", 0.0)), 2),
            )
            for r in raw_results
        ]

        # Step 7: Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)

        # Step 8: Log search event for analytics
        search_event_id = None
        try:
            event = db_service.log_search_event(
                tenant_id=request.tenant_id,
                query=request.query,
                results_count=len(results),
                result_product_ids=[r.product_id for r in results],
                parsed_constraints=constraints_dict,
                session_id=request.session_id,
                source=request.source,
                latency_ms=latency_ms,
            )
            if event:
                search_event_id = event.get("id")
        except Exception:
            pass  # Analytics logging is non-critical

        return SearchResponse(
            results=results,
            count=len(results),
            query_understanding=constraints_dict,
            search_event_id=search_event_id,
            latency_ms=latency_ms,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/track-click")
async def track_click(request: TrackClickRequest):
    """
    Track a click on a search result.
    Use the search_event_id returned from the search response.
    """
    try:
        db_service.track_click(request.search_event_id, request.product_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ENHANCED SEARCH (v2) ====================


@router.post("/v2/search", response_model=SearchResponse)
async def search_products_v2(request: SearchRequest):
    """
    Enhanced semantic product search with validation and optional reranking.

    This endpoint uses the new RAG pipeline with:
    - Security: Injection detection + sanitization
    - Caching: In-memory cache for repeated queries
    - Validation: LLM validates results match user constraints
    - Reranking: Optional LLM reranking for better relevance

    Strategies:
    - fast: Vector search only (lowest latency)
    - validated: Vector search + LLM validation (default)
    - full: Vector search + validation + reranking (best quality)

    Set strategy via request body or use the default from config.
    """
    if not request.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    if not request.tenant_id.strip():
        raise HTTPException(status_code=400, detail="tenant_id is required")

    # Security check
    detection = injection_detector.detect(request.query)
    if detection.risk_level == "high":
        logger.warning(
            f"High-risk injection attempt in v2 search for tenant {request.tenant_id}: "
            f"{detection.message}"
        )
        raise HTTPException(
            status_code=400,
            detail="Your search contains invalid content. Please rephrase your query."
        )

    # Sanitize query
    safe_query = sanitizer.sanitize_query(request.query)

    try:
        # Use enhanced retriever
        result = await enhanced_retriever.retrieve(
            query=safe_query,
            tenant_id=request.tenant_id,
            top_k=request.top_k,
            strategy=request.strategy,
            use_query_understanding=request.use_query_understanding,
        )

        # Format results
        results = [
            SearchResult(
                product_id=r["product_id"],
                name=r["name"],
                price=r["price"],
                description=r.get("description"),
                image_url=r.get("image_url"),
                permalink=r.get("permalink"),
                categories=r.get("categories", []),
                stock_status=r.get("stock_status", "instock"),
                score=r.get("score", 0.0),
            )
            for r in result.results
        ]

        # Log search event for analytics (non-critical)
        search_event_id = None
        try:
            event = db_service.log_search_event(
                tenant_id=request.tenant_id,
                query=request.query,
                results_count=len(results),
                result_product_ids=[r.product_id for r in results],
                parsed_constraints=result.query_understanding,
                session_id=request.session_id,
                source=request.source,
                latency_ms=result.latency_ms,
            )
            if event:
                search_event_id = event.get("id")
        except Exception:
            pass

        return SearchResponse(
            results=results,
            count=result.count,
            query_understanding=result.query_understanding,
            validation_summary=result.validation_summary,
            search_event_id=search_event_id,
            strategy_used=result.strategy_used,
            cache_hit=result.cache_hit,
            latency_ms=result.latency_ms,
        )

    except Exception as e:
        logger.error(f"Enhanced search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== API KEY AUTHENTICATED SEARCH ====================


@router.post("/v1/search", response_model=SearchResponse)
async def search_with_api_key(
    request: SearchRequest,
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    """
    Search endpoint authenticated with API key (for widget use).

    Include your API key in the X-API-Key header.
    The tenant_id will be derived from the API key.
    """
    # Validate API key
    key_data = db_service.validate_api_key(x_api_key)
    if not key_data:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Check scopes
    if "search" not in key_data.get("scopes", []):
        raise HTTPException(status_code=403, detail="API key does not have search scope")

    # Override tenant_id from API key (security)
    request.tenant_id = key_data["tenant_id"]

    # Use the main search function
    return await search_products(request)


# ==================== QUICK SEARCH (NO QUERY UNDERSTANDING) ====================


@router.get("/quick")
async def quick_search(
    q: str,
    tenant_id: str,
    limit: int = 5,
):
    """
    Fast search endpoint without query understanding.
    Good for autocomplete/typeahead use cases.
    Includes basic input sanitization.
    """
    if not q.strip():
        return {"results": [], "count": 0}

    # Sanitize the query (quick endpoint, so no injection check - just sanitize)
    safe_query = sanitizer.sanitize_query(q)

    try:
        raw_results = vector_service.search(
            query=safe_query,
            tenant_id=tenant_id,
            top_k=limit,
        )

        return {
            "results": [
                {
                    "product_id": r["product_id"],
                    "name": r["name"],
                    "price": r["price"],
                    "image_url": r.get("image_url"),
                }
                for r in raw_results
            ],
            "count": len(raw_results),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
