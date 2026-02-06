"""
Search Routes
Handles semantic search endpoints with tenant isolation and query understanding.
"""

import time
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import Optional

from app.services.vector_service import vector_service
from app.services.query_service import query_service
from app.services.db_service import db_service

router = APIRouter(prefix="/search", tags=["search"])


# ==================== REQUEST/RESPONSE MODELS ====================


class SearchRequest(BaseModel):
    query: str
    tenant_id: str
    top_k: int = 5
    use_query_understanding: bool = True  # Whether to parse constraints
    session_id: Optional[str] = None
    source: str = "search_bar"  # search_bar, chat, api


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
    search_event_id: Optional[int] = None  # For click tracking
    latency_ms: int = 0


class TrackClickRequest(BaseModel):
    search_event_id: int
    product_id: str
    tenant_id: str


# ==================== SEARCH ENDPOINTS ====================


@router.post("/", response_model=SearchResponse)
async def search_products(request: SearchRequest):
    """
    Semantic product search with HARD tenant isolation.

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

    try:
        # Step 1: Query understanding (optional)
        constraints_dict = None
        embedding_query = request.query

        if request.use_query_understanding:
            query_result = query_service.understand(request.query)
            constraints_dict = query_result.constraints.to_dict()
            embedding_query = query_result.embedding_query

        # Step 2: Vector search with tenant filter
        raw_results = vector_service.search(
            query=embedding_query,
            tenant_id=request.tenant_id,
            top_k=request.top_k,
        )

        # Step 3: Apply additional filtering if constraints present
        # (Price filtering example - for more, add payload indexes in Qdrant)
        if constraints_dict and (constraints_dict.get("budget_max") or constraints_dict.get("budget_min")):
            filtered_results = []
            for r in raw_results:
                price = r.get("price", 0)
                if constraints_dict.get("budget_max") and price > constraints_dict["budget_max"]:
                    continue
                if constraints_dict.get("budget_min") and price < constraints_dict["budget_min"]:
                    continue
                filtered_results.append(r)
            raw_results = filtered_results

        # Step 4: Format results
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
            for r in raw_results
        ]

        # Step 5: Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)

        # Step 6: Log search event for analytics
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
    """
    if not q.strip():
        return {"results": [], "count": 0}

    try:
        raw_results = vector_service.search(
            query=q,
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
