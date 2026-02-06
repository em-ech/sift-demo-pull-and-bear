"""
Admin Routes
Handles retailer management, product ingestion, and analytics.
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import json
import io

from app.services.db_service import db_service
from app.services.vector_service import vector_service
from app.services.job_service import job_service
from app.services.woocommerce_service import WooCommerceService
from app.services.ingestion import IngestionPipeline, create_fast_pipeline, create_full_pipeline
from app.schemas.product import ProductRaw
from app.schemas.ingestion import JobType, JobStatus, ConnectorType

router = APIRouter(prefix="/admin", tags=["admin"])


# ==================== REQUEST/RESPONSE MODELS ====================


class TenantCreate(BaseModel):
    tenant_id: str
    name: str
    woocommerce_url: Optional[str] = None
    woocommerce_key: Optional[str] = None
    woocommerce_secret: Optional[str] = None


class WooCommerceSyncRequest(BaseModel):
    tenant_id: str
    woocommerce_url: str
    consumer_key: str
    consumer_secret: str
    enrich_attributes: bool = False  # Whether to run LLM extraction


class ConnectorCreate(BaseModel):
    tenant_id: str
    name: str
    type: ConnectorType
    config: dict = {}
    sync_frequency: str = "daily"


class AnalyticsResponse(BaseModel):
    total_searches: int
    unique_queries: int
    zero_result_queries: list
    top_queries: list
    conversion_rate: float


# ==================== TENANT ROUTES ====================


@router.post("/tenants")
async def create_tenant(tenant: TenantCreate):
    """Register a new retailer."""
    try:
        config = {}
        if tenant.woocommerce_url:
            config["woocommerce"] = {
                "url": tenant.woocommerce_url,
                "key": tenant.woocommerce_key,
                "secret": tenant.woocommerce_secret,
            }

        result = db_service.create_tenant(
            tenant_id=tenant.tenant_id,
            name=tenant.name,
            config=config,
        )
        return {"success": True, "tenant": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants")
async def list_tenants():
    """List all registered retailers."""
    try:
        tenants = db_service.list_tenants()
        return {"tenants": tenants}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tenants/{tenant_id}")
async def get_tenant(tenant_id: str):
    """Get a specific retailer."""
    try:
        tenant = db_service.get_tenant(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant not found")
        return {"tenant": tenant}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== CONNECTOR ROUTES ====================


@router.post("/connectors")
async def create_connector(connector: ConnectorCreate):
    """Create a new catalog connector."""
    try:
        result = db_service.create_connector(
            tenant_id=connector.tenant_id,
            name=connector.name,
            connector_type=connector.type.value,
            config=connector.config,
            sync_frequency=connector.sync_frequency,
        )
        return {"success": True, "connector": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/connectors/{tenant_id}")
async def list_connectors(tenant_id: str):
    """List all connectors for a tenant."""
    try:
        connectors = db_service.get_tenant_connectors(tenant_id)
        return {"connectors": connectors}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/connectors/{connector_id}")
async def delete_connector(connector_id: str):
    """Delete a connector."""
    try:
        db_service.delete_connector(connector_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== INGESTION JOB ROUTES ====================


@router.get("/jobs/{tenant_id}")
async def list_jobs(tenant_id: str, limit: int = 20):
    """List ingestion jobs for a tenant."""
    try:
        jobs = job_service.get_tenant_jobs(tenant_id, limit=limit)
        return {"jobs": jobs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{tenant_id}/{job_id}")
async def get_job(tenant_id: str, job_id: str):
    """Get details of a specific job."""
    try:
        job = job_service.get_job(job_id)
        if not job or job.get("tenant_id") != tenant_id:
            raise HTTPException(status_code=404, detail="Job not found")
        return {"job": job}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== PRODUCT INGESTION ROUTES ====================


def run_ingestion_job(
    job_id: str,
    tenant_id: str,
    raw_products: list[ProductRaw],
    connector_id: str = None,
    enrich_attributes: bool = False,
):
    """Background task to run the ingestion pipeline."""
    try:
        # Start the job
        job_service.start_job(job_id, total_items=len(raw_products))

        # Create pipeline
        if enrich_attributes:
            pipeline = create_full_pipeline()
        else:
            pipeline = create_fast_pipeline()

        # Process products
        def progress_callback(processed: int, total: int):
            job_service.update_progress(job_id, processed)

        result = pipeline.process(
            raw_products,
            tenant_id,
            connector_id,
            progress_callback=progress_callback,
        )

        # Store in databases
        if result.products:
            # Convert to dicts for storage
            products_data = [p.model_dump() for p in result.products]

            # Store in Supabase
            try:
                db_service.upsert_products_v2(products_data)
            except Exception as e:
                result.warnings.append(f"Supabase upsert warning: {e}")

            # Store attributes
            if result.attributes:
                try:
                    attrs_data = [a.model_dump() for a in result.attributes]
                    db_service.upsert_attributes(attrs_data)
                except Exception as e:
                    result.warnings.append(f"Attributes upsert warning: {e}")

            # Store in Qdrant (vectors)
            try:
                vector_products = [
                    {
                        "id": p.external_id,
                        "tenant_id": p.tenant_id,
                        "name": p.name,
                        "price": p.price,
                        "short_description": p.short_description,
                        "image_url": p.image_url,
                        "permalink": p.permalink,
                        "categories": p.categories,
                        "stock_status": p.stock_status,
                        "combined_text": p.embedding_text,
                    }
                    for p in result.products
                ]
                vector_service.upsert_products_batch(vector_products)
            except Exception as e:
                result.warnings.append(f"Qdrant upsert warning: {e}")

        # Update connector sync status if applicable
        if connector_id:
            try:
                db_service.update_connector_sync_status(
                    connector_id,
                    "success" if result.failed == 0 else "partial",
                    result.successful,
                )
            except Exception:
                pass

        # Complete the job
        job_service.complete_job(
            job_id,
            successful=result.successful,
            failed=result.failed,
            skipped=result.skipped,
            warnings=result.warnings,
        )

    except Exception as e:
        job_service.fail_job(job_id, str(e))


@router.post("/upload")
async def upload_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    tenant_id: str = Form(...),
    connector_id: Optional[str] = Form(None),
    enrich_attributes: bool = Form(False),
):
    """
    Upload a CSV/JSON file to ingest products.

    Expected CSV columns:
    - name (required)
    - description
    - price
    - image_url
    - category
    - sku
    - brand
    - stock_status

    Returns immediately with job_id - check /admin/jobs/{tenant_id}/{job_id} for status.
    """
    filename = file.filename.lower()
    if not (filename.endswith(".csv") or filename.endswith(".json")):
        raise HTTPException(status_code=400, detail="File must be CSV or JSON")

    try:
        contents = await file.read()

        # Parse file
        if filename.endswith(".csv"):
            df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
            if "name" not in df.columns:
                raise HTTPException(status_code=400, detail="CSV must have a 'name' column")
            records = df.to_dict("records")
        else:
            records = json.loads(contents.decode("utf-8"))
            if isinstance(records, dict):
                records = [records]

        # Convert to ProductRaw
        raw_products = []
        for i, row in enumerate(records):
            raw = ProductRaw(
                id=str(row.get("id", i)),
                name=row.get("name", ""),
                description=str(row.get("description", "")),
                short_description=str(row.get("short_description", "")),
                price=float(row.get("price", 0)) if row.get("price") else 0,
                regular_price=float(row.get("regular_price", 0)) if row.get("regular_price") else None,
                sale_price=float(row.get("sale_price")) if row.get("sale_price") else None,
                sku=str(row.get("sku", "")),
                brand=str(row.get("brand", "")),
                categories=[row.get("category", "")] if row.get("category") else [],
                tags=row.get("tags", "").split(",") if isinstance(row.get("tags"), str) else [],
                image_url=row.get("image_url"),
                permalink=row.get("url", row.get("permalink", "")),
                stock_status=row.get("stock_status", "instock"),
                raw_data=row,
            )
            raw_products.append(raw)

        if not raw_products:
            raise HTTPException(status_code=400, detail="No valid products found in file")

        # Create job
        job_id = job_service.create_job(
            tenant_id=tenant_id,
            job_type=JobType.MANUAL_UPLOAD,
            connector_id=connector_id,
            triggered_by="upload",
            metadata={"filename": file.filename, "row_count": len(raw_products)},
        )

        # Run in background
        background_tasks.add_task(
            run_ingestion_job,
            job_id,
            tenant_id,
            raw_products,
            connector_id,
            enrich_attributes,
        )

        return {
            "success": True,
            "job_id": job_id,
            "products_queued": len(raw_products),
            "message": f"Ingestion job started. Check /admin/jobs/{tenant_id}/{job_id} for status.",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync/woocommerce")
async def sync_woocommerce(
    request: WooCommerceSyncRequest,
    background_tasks: BackgroundTasks,
):
    """
    Sync products from a WooCommerce store.
    Returns immediately with job_id - check status with /admin/jobs/{tenant_id}/{job_id}.
    """
    try:
        # Initialize WooCommerce client
        wc = WooCommerceService(
            url=request.woocommerce_url,
            consumer_key=request.consumer_key,
            consumer_secret=request.consumer_secret,
        )

        # Fetch all products (this is relatively fast)
        raw_wc_products = wc.get_all_products()

        if not raw_wc_products:
            raise HTTPException(status_code=400, detail="No products found in WooCommerce store")

        # Convert to ProductRaw
        raw_products = []
        for p in raw_wc_products:
            normalized = wc.normalize_product(p, request.tenant_id)
            raw = ProductRaw(
                id=normalized["id"],
                name=normalized["name"],
                description=normalized.get("description", ""),
                short_description=normalized.get("short_description", ""),
                price=float(normalized.get("price", 0)) if normalized.get("price") else 0,
                regular_price=float(normalized.get("regular_price", 0)) if normalized.get("regular_price") else None,
                sale_price=float(normalized.get("sale_price")) if normalized.get("sale_price") else None,
                sku=normalized.get("sku", ""),
                categories=normalized.get("categories", []),
                image_url=normalized.get("image_url"),
                permalink=normalized.get("permalink", ""),
                stock_status=normalized.get("stock_status", "instock"),
                raw_data=p,
            )
            raw_products.append(raw)

        # Clear existing products for this tenant (full sync)
        vector_service.delete_tenant_products(request.tenant_id)
        try:
            db_service.delete_tenant_products(request.tenant_id)
        except Exception:
            pass

        # Create job
        job_id = job_service.create_job(
            tenant_id=request.tenant_id,
            job_type=JobType.FULL_SYNC,
            triggered_by="woocommerce_sync",
            metadata={"woocommerce_url": request.woocommerce_url, "product_count": len(raw_products)},
        )

        # Run in background
        background_tasks.add_task(
            run_ingestion_job,
            job_id,
            request.tenant_id,
            raw_products,
            None,
            request.enrich_attributes,
        )

        return {
            "success": True,
            "job_id": job_id,
            "products_queued": len(raw_products),
            "message": f"Sync job started. Check /admin/jobs/{request.tenant_id}/{job_id} for status.",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== API KEY ROUTES ====================


@router.post("/api-keys/{tenant_id}")
async def create_api_key(tenant_id: str, name: str = "Default"):
    """
    Create a new API key for a tenant.
    The raw key is only shown once - store it securely!
    """
    try:
        raw_key, key_record = db_service.create_api_key(tenant_id, name)
        return {
            "success": True,
            "api_key": raw_key,  # Show only once!
            "key_info": {
                "id": key_record["id"],
                "prefix": key_record["key_prefix"],
                "name": key_record["name"],
            },
            "warning": "Save this key now - it won't be shown again!",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api-keys/{tenant_id}")
async def list_api_keys(tenant_id: str):
    """List all API keys for a tenant (without revealing the actual keys)."""
    try:
        keys = db_service.get_tenant_api_keys(tenant_id)
        return {"api_keys": keys}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(key_id: str):
    """Revoke an API key."""
    try:
        db_service.revoke_api_key(key_id)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== ANALYTICS ROUTES ====================


@router.get("/analytics/{tenant_id}")
async def get_analytics(tenant_id: str, days: int = 30):
    """
    Get comprehensive analytics for a retailer.

    Returns:
    - Total searches
    - Unique queries
    - Zero-result queries (the "Demand Map" - what users want but can't find)
    - Top queries
    - Click-through rate
    - Product count
    """
    try:
        analytics = db_service.get_enhanced_analytics(tenant_id, days=days)
        return analytics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/{tenant_id}/zero-results")
async def get_zero_result_queries(tenant_id: str, limit: int = 50):
    """Get zero-result queries for demand analysis."""
    try:
        queries = db_service.get_zero_result_queries(tenant_id, limit=limit)
        return {"zero_result_queries": queries}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/products/{tenant_id}")
async def get_products(tenant_id: str, limit: int = 100):
    """Get all products for a tenant."""
    try:
        products = db_service.get_products(tenant_id, limit=limit)
        return {"products": products, "count": len(products)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
