"""
Database Service
Handles Supabase operations for relational data:
- Tenants (retailers)
- Products (source of truth)
- Connectors (catalog sources)
- Product Attributes (derived)
- Search Events (analytics)
"""

from supabase import create_client, Client
from datetime import datetime, timedelta
from typing import Optional
import hashlib
import secrets

from app.core.config import settings


class DatabaseService:
    def __init__(self):
        if settings.SUPABASE_URL and settings.SUPABASE_KEY:
            self.client: Client = create_client(
                settings.SUPABASE_URL,
                settings.SUPABASE_KEY,
            )
        else:
            self.client = None

    def _ensure_client(self):
        if not self.client:
            raise Exception("Supabase not configured. Set SUPABASE_URL and SUPABASE_KEY.")

    # ==================== TENANT OPERATIONS ====================

    def create_tenant(self, tenant_id: str, name: str, config: dict = None) -> dict:
        """Register a new retailer/tenant."""
        self._ensure_client()
        data = {
            "id": tenant_id,
            "name": name,
            "config": config or {},
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self.client.table("tenants").insert(data).execute()
        return result.data[0] if result.data else None

    def get_tenant(self, tenant_id: str) -> Optional[dict]:
        """Get tenant by ID."""
        self._ensure_client()
        result = (
            self.client.table("tenants")
            .select("*")
            .eq("id", tenant_id)
            .single()
            .execute()
        )
        return result.data

    def list_tenants(self) -> list[dict]:
        """List all tenants."""
        self._ensure_client()
        result = self.client.table("tenants").select("*").execute()
        return result.data or []

    # ==================== PRODUCT OPERATIONS ====================

    def upsert_product(self, product: dict) -> dict:
        """Insert or update a product in Supabase."""
        self._ensure_client()
        data = {
            "id": f"{product['tenant_id']}_{product['id']}",
            "tenant_id": product["tenant_id"],
            "external_id": product["id"],
            "name": product["name"],
            "slug": product["slug"],
            "sku": product.get("sku", ""),
            "price": float(product["price"]) if product["price"] else 0,
            "regular_price": float(product["regular_price"]) if product["regular_price"] else 0,
            "sale_price": float(product["sale_price"]) if product["sale_price"] else None,
            "stock_status": product["stock_status"],
            "stock_quantity": product.get("stock_quantity"),
            "description": product["description"],
            "short_description": product["short_description"],
            "categories": product["categories"],
            "image_url": product["image_url"],
            "permalink": product["permalink"],
            "updated_at": datetime.utcnow().isoformat(),
        }
        result = self.client.table("products").upsert(data).execute()
        return result.data[0] if result.data else None

    def upsert_products_batch(self, products: list[dict]) -> int:
        """Batch upsert products."""
        self._ensure_client()
        data = [
            {
                "id": f"{p['tenant_id']}_{p['id']}",
                "tenant_id": p["tenant_id"],
                "external_id": p["id"],
                "name": p["name"],
                "slug": p["slug"],
                "sku": p.get("sku", ""),
                "price": float(p["price"]) if p["price"] else 0,
                "regular_price": float(p["regular_price"]) if p["regular_price"] else 0,
                "sale_price": float(p["sale_price"]) if p["sale_price"] else None,
                "stock_status": p["stock_status"],
                "stock_quantity": p.get("stock_quantity"),
                "description": p["description"],
                "short_description": p["short_description"],
                "categories": p["categories"],
                "image_url": p["image_url"],
                "permalink": p["permalink"],
                "updated_at": datetime.utcnow().isoformat(),
            }
            for p in products
        ]
        result = self.client.table("products").upsert(data).execute()
        return len(result.data) if result.data else 0

    def get_products(self, tenant_id: str, limit: int = 100) -> list[dict]:
        """Get products for a tenant."""
        self._ensure_client()
        result = (
            self.client.table("products")
            .select("*")
            .eq("tenant_id", tenant_id)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def get_product(self, tenant_id: str, product_id: str) -> Optional[dict]:
        """Get a specific product."""
        self._ensure_client()
        result = (
            self.client.table("products")
            .select("*")
            .eq("id", f"{tenant_id}_{product_id}")
            .single()
            .execute()
        )
        return result.data

    def delete_tenant_products(self, tenant_id: str) -> None:
        """Delete all products for a tenant."""
        self._ensure_client()
        self.client.table("products").delete().eq("tenant_id", tenant_id).execute()

    # ==================== SEARCH LOG OPERATIONS (ROI Analytics) ====================

    def log_search(
        self,
        tenant_id: str,
        query: str,
        results_count: int,
        session_id: Optional[str] = None,
        converted: bool = False,
    ) -> dict:
        """
        Log a search query for analytics.
        This powers the "Demand Map" feature - showing what users want but can't find.
        """
        self._ensure_client()
        data = {
            "tenant_id": tenant_id,
            "query": query,
            "results_count": results_count,
            "session_id": session_id,
            "converted": converted,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self.client.table("search_logs").insert(data).execute()
        return result.data[0] if result.data else None

    def get_search_analytics(
        self, tenant_id: str, days: int = 30
    ) -> dict:
        """
        Get search analytics for a tenant.
        Returns: top queries, zero-result queries, conversion rate.
        """
        self._ensure_client()
        from datetime import timedelta

        since = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Get all searches in time period
        result = (
            self.client.table("search_logs")
            .select("*")
            .eq("tenant_id", tenant_id)
            .gte("created_at", since)
            .execute()
        )

        logs = result.data or []

        if not logs:
            return {
                "total_searches": 0,
                "unique_queries": 0,
                "zero_result_queries": [],
                "top_queries": [],
                "conversion_rate": 0,
            }

        # Analyze
        from collections import Counter

        queries = [log["query"].lower() for log in logs]
        zero_results = [log["query"] for log in logs if log["results_count"] == 0]
        conversions = sum(1 for log in logs if log["converted"])

        query_counts = Counter(queries)
        zero_result_counts = Counter(zero_results)

        return {
            "total_searches": len(logs),
            "unique_queries": len(set(queries)),
            "zero_result_queries": zero_result_counts.most_common(10),
            "top_queries": query_counts.most_common(10),
            "conversion_rate": conversions / len(logs) if logs else 0,
        }

    # ==================== CONNECTOR OPERATIONS ====================

    def create_connector(
        self,
        tenant_id: str,
        name: str,
        connector_type: str,
        config: dict = None,
        sync_frequency: str = "daily",
    ) -> dict:
        """Create a new connector for a tenant."""
        self._ensure_client()
        data = {
            "tenant_id": tenant_id,
            "name": name,
            "type": connector_type,
            "config": config or {},
            "sync_frequency": sync_frequency,
            "created_at": datetime.utcnow().isoformat(),
        }
        result = self.client.table("connectors").insert(data).execute()
        return result.data[0] if result.data else None

    def get_connector(self, connector_id: str) -> Optional[dict]:
        """Get a connector by ID."""
        self._ensure_client()
        result = (
            self.client.table("connectors")
            .select("*")
            .eq("id", connector_id)
            .single()
            .execute()
        )
        return result.data

    def get_tenant_connectors(self, tenant_id: str) -> list[dict]:
        """Get all connectors for a tenant."""
        self._ensure_client()
        result = (
            self.client.table("connectors")
            .select("*")
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    def update_connector_sync_status(
        self,
        connector_id: str,
        status: str,
        products_count: int = 0,
    ) -> None:
        """Update connector's last sync status."""
        self._ensure_client()
        self.client.table("connectors").update({
            "last_sync_at": datetime.utcnow().isoformat(),
            "last_sync_status": status,
            "last_sync_products_count": products_count,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", connector_id).execute()

    def delete_connector(self, connector_id: str) -> None:
        """Delete a connector."""
        self._ensure_client()
        self.client.table("connectors").delete().eq("id", connector_id).execute()

    # ==================== ENHANCED PRODUCT OPERATIONS ====================

    def upsert_products_v2(self, products: list[dict]) -> int:
        """
        Batch upsert products with full schema support.
        Expects products in ProductCreate format.
        """
        self._ensure_client()

        data = []
        for p in products:
            product_data = {
                "id": p.get("id"),
                "tenant_id": p.get("tenant_id"),
                "connector_id": p.get("connector_id"),
                "external_id": p.get("external_id"),
                "name": p.get("name"),
                "slug": p.get("slug"),
                "sku": p.get("sku", ""),
                "brand": p.get("brand", ""),
                "price": float(p.get("price", 0)) if p.get("price") else 0,
                "regular_price": float(p.get("regular_price", 0)) if p.get("regular_price") else 0,
                "sale_price": float(p.get("sale_price")) if p.get("sale_price") else None,
                "currency": p.get("currency", "USD"),
                "stock_status": p.get("stock_status", "instock"),
                "stock_quantity": p.get("stock_quantity"),
                "description": p.get("description", ""),
                "short_description": p.get("short_description", ""),
                "categories": p.get("categories", []),
                "tags": p.get("tags", []),
                "image_url": p.get("image_url"),
                "gallery_urls": p.get("gallery_urls", []),
                "permalink": p.get("permalink", ""),
                "raw_data": p.get("raw_data"),
                "embedding_text": p.get("embedding_text", ""),
                "last_synced_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }
            data.append(product_data)

        if data:
            result = self.client.table("products").upsert(data).execute()
            return len(result.data) if result.data else 0
        return 0

    # ==================== PRODUCT ATTRIBUTE OPERATIONS ====================

    def upsert_attributes(self, attributes: list[dict]) -> int:
        """Batch upsert product attributes."""
        self._ensure_client()

        if not attributes:
            return 0

        data = []
        for attr in attributes:
            data.append({
                "product_id": attr.get("product_id"),
                "tenant_id": attr.get("tenant_id"),
                "attribute_name": attr.get("attribute_name"),
                "attribute_value": attr.get("attribute_value"),
                "confidence": float(attr.get("confidence", 0)),
                "extraction_method": attr.get("extraction_method", "llm"),
                "source_field": attr.get("source_field"),
                "created_at": datetime.utcnow().isoformat(),
            })

        result = self.client.table("product_attributes").upsert(
            data,
            on_conflict="product_id,attribute_name"
        ).execute()
        return len(result.data) if result.data else 0

    def get_product_attributes(self, product_id: str) -> list[dict]:
        """Get all attributes for a product."""
        self._ensure_client()
        result = (
            self.client.table("product_attributes")
            .select("*")
            .eq("product_id", product_id)
            .execute()
        )
        return result.data or []

    def delete_product_attributes(self, product_id: str) -> None:
        """Delete all attributes for a product."""
        self._ensure_client()
        self.client.table("product_attributes").delete().eq("product_id", product_id).execute()

    # ==================== API KEY OPERATIONS ====================

    def create_api_key(
        self,
        tenant_id: str,
        name: str = "Default",
        scopes: list[str] = None,
    ) -> tuple[str, dict]:
        """
        Create a new API key for a tenant.
        Returns (raw_key, key_record) - raw_key should be shown once to user.
        """
        self._ensure_client()

        # Generate a secure random key
        raw_key = f"sk_live_{secrets.token_urlsafe(32)}"
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:12]

        data = {
            "tenant_id": tenant_id,
            "key_hash": key_hash,
            "key_prefix": key_prefix,
            "name": name,
            "scopes": scopes or ["search", "chat"],
            "created_at": datetime.utcnow().isoformat(),
        }

        result = self.client.table("api_keys").insert(data).execute()
        return raw_key, result.data[0] if result.data else None

    def validate_api_key(self, raw_key: str) -> Optional[dict]:
        """
        Validate an API key and return the associated tenant info.
        Returns None if invalid.
        """
        self._ensure_client()

        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

        result = (
            self.client.table("api_keys")
            .select("*, tenants(*)")
            .eq("key_hash", key_hash)
            .eq("is_active", True)
            .single()
            .execute()
        )

        if result.data:
            # Update last_used_at
            self.client.table("api_keys").update({
                "last_used_at": datetime.utcnow().isoformat()
            }).eq("id", result.data["id"]).execute()

            return result.data
        return None

    def get_tenant_api_keys(self, tenant_id: str) -> list[dict]:
        """Get all API keys for a tenant (without the hash)."""
        self._ensure_client()
        result = (
            self.client.table("api_keys")
            .select("id, tenant_id, key_prefix, name, scopes, is_active, last_used_at, created_at")
            .eq("tenant_id", tenant_id)
            .execute()
        )
        return result.data or []

    def revoke_api_key(self, key_id: str) -> None:
        """Revoke an API key."""
        self._ensure_client()
        self.client.table("api_keys").update({
            "is_active": False
        }).eq("id", key_id).execute()

    # ==================== ENHANCED SEARCH ANALYTICS ====================

    def log_search_event(
        self,
        tenant_id: str,
        query: str,
        results_count: int,
        result_product_ids: list[str] = None,
        parsed_constraints: dict = None,
        session_id: str = None,
        source: str = "search_bar",
        latency_ms: int = None,
    ) -> dict:
        """Log a search event with full analytics data."""
        self._ensure_client()

        data = {
            "tenant_id": tenant_id,
            "query": query,
            "results_count": results_count,
            "result_product_ids": result_product_ids or [],
            "parsed_constraints": parsed_constraints,
            "session_id": session_id,
            "source": source,
            "latency_ms": latency_ms,
            "created_at": datetime.utcnow().isoformat(),
        }

        result = self.client.table("search_events").insert(data).execute()

        # Track zero-result queries
        if results_count == 0:
            try:
                self.client.rpc("upsert_zero_result_query", {
                    "p_tenant_id": tenant_id,
                    "p_query": query,
                }).execute()
            except Exception:
                pass  # Non-critical

        return result.data[0] if result.data else None

    def track_click(
        self,
        search_event_id: int,
        product_id: str,
    ) -> None:
        """Track a click on a search result."""
        self._ensure_client()

        # Get current clicked products
        result = (
            self.client.table("search_events")
            .select("clicked_product_ids, clicked_at")
            .eq("id", search_event_id)
            .single()
            .execute()
        )

        if result.data:
            clicked_ids = result.data.get("clicked_product_ids") or []
            clicked_at = result.data.get("clicked_at") or []

            clicked_ids.append(product_id)
            clicked_at.append(datetime.utcnow().isoformat())

            self.client.table("search_events").update({
                "clicked_product_ids": clicked_ids,
                "clicked_at": clicked_at,
            }).eq("id", search_event_id).execute()

    def get_zero_result_queries(
        self,
        tenant_id: str,
        limit: int = 50,
        reviewed: bool = None,
    ) -> list[dict]:
        """Get zero-result queries for demand analysis."""
        self._ensure_client()

        query = (
            self.client.table("zero_result_queries")
            .select("*")
            .eq("tenant_id", tenant_id)
            .order("occurrence_count", desc=True)
            .limit(limit)
        )

        if reviewed is not None:
            query = query.eq("is_reviewed", reviewed)

        result = query.execute()
        return result.data or []

    def get_enhanced_analytics(
        self,
        tenant_id: str,
        days: int = 30,
    ) -> dict:
        """Get comprehensive analytics for a tenant."""
        self._ensure_client()

        since = (datetime.utcnow() - timedelta(days=days)).isoformat()

        # Get search events
        events = (
            self.client.table("search_events")
            .select("*")
            .eq("tenant_id", tenant_id)
            .gte("created_at", since)
            .execute()
        ).data or []

        # Get zero result queries
        zero_results = (
            self.client.table("zero_result_queries")
            .select("*")
            .eq("tenant_id", tenant_id)
            .order("occurrence_count", desc=True)
            .limit(20)
            .execute()
        ).data or []

        # Get product count
        products = (
            self.client.table("products")
            .select("id", count="exact")
            .eq("tenant_id", tenant_id)
            .execute()
        )
        product_count = products.count if products else 0

        if not events:
            return {
                "total_searches": 0,
                "unique_queries": 0,
                "searches_with_results": 0,
                "searches_with_clicks": 0,
                "zero_result_rate": 0,
                "click_through_rate": 0,
                "avg_latency_ms": 0,
                "top_queries": [],
                "zero_result_queries": zero_results,
                "product_count": product_count,
            }

        # Calculate metrics
        from collections import Counter

        queries = [e["query"].lower() for e in events]
        query_counts = Counter(queries)

        searches_with_results = sum(1 for e in events if e.get("results_count", 0) > 0)
        searches_with_clicks = sum(1 for e in events if e.get("clicked_product_ids"))
        latencies = [e.get("latency_ms") for e in events if e.get("latency_ms")]

        return {
            "total_searches": len(events),
            "unique_queries": len(set(queries)),
            "searches_with_results": searches_with_results,
            "searches_with_clicks": searches_with_clicks,
            "zero_result_rate": (len(events) - searches_with_results) / len(events) if events else 0,
            "click_through_rate": searches_with_clicks / len(events) if events else 0,
            "avg_latency_ms": sum(latencies) / len(latencies) if latencies else 0,
            "top_queries": query_counts.most_common(20),
            "zero_result_queries": zero_results,
            "product_count": product_count,
        }


# Singleton instance
db_service = DatabaseService()
