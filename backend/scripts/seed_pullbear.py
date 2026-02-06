#!/usr/bin/env python3
"""
Seed script for loading Pull & Bear catalog into Sift Retail AI.

Usage:
    cd backend
    uv run python scripts/seed_pullbear.py

This script:
1. Creates the 'pullbear' tenant if it doesn't exist
2. Loads products from data/pullbear_catalog.json
3. Runs them through the ingestion pipeline (normalize, embed)
4. Stores them in Supabase and Qdrant
"""

import json
import sys
from pathlib import Path

# Add the backend app to the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.db_service import DatabaseService
from app.services.vector_service import VectorService
from app.schemas.product import ProductRaw
from app.services.ingestion import IngestionPipeline, create_fast_pipeline


def main():
    """Load Pull & Bear catalog into the system."""

    # Load catalog
    catalog_path = Path(__file__).parent.parent / "data" / "pullbear_catalog.json"
    if not catalog_path.exists():
        print(f"Error: Catalog not found at {catalog_path}")
        sys.exit(1)

    with open(catalog_path) as f:
        products = json.load(f)

    print(f"Loaded {len(products)} products from {catalog_path.name}")

    # Initialize services
    db = DatabaseService()
    vector = VectorService()

    tenant_id = "pullbear"

    # Check/create tenant
    print(f"\nChecking tenant '{tenant_id}'...")
    try:
        result = db.client.table("tenants").select("id").eq("id", tenant_id).execute()
        if not result.data:
            print(f"Creating tenant '{tenant_id}'...")
            # Use only columns that exist in the current schema
            db.client.table("tenants").insert({
                "id": tenant_id,
                "name": "Pull & Bear",
                "config": {"description": "Pull & Bear fashion demo store"},
            }).execute()
            print(f"Tenant '{tenant_id}' created")
        else:
            print(f"Tenant '{tenant_id}' exists")
    except Exception as e:
        print(f"Warning: Could not verify tenant: {e}")

    # Create ingestion pipeline (fast mode - no LLM enrichment)
    pipeline = create_fast_pipeline()

    # Transform products to ProductRaw objects
    raw_products = []
    for p in products:
        tags = p.get("tags", "")
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        raw = ProductRaw(
            id=p["id"],
            name=p["name"],
            description=p.get("description", ""),
            price=float(p.get("price", 0)),
            categories=[p.get("category", "")] if p.get("category") else [],
            image_url=p.get("image_url"),
            brand=p.get("brand", "Pull & Bear"),
            tags=tags,
            stock_status="instock",
        )
        raw_products.append(raw)

    print(f"\nProcessing {len(raw_products)} products through ingestion pipeline...")
    print("(This may take a few minutes for embedding generation)\n")

    # Process through pipeline
    def progress_callback(processed, total):
        print(f"  Normalizing: {processed}/{total}")

    result = pipeline.process(raw_products, tenant_id, progress_callback=progress_callback)

    print(f"\nPipeline complete:")
    print(f"  - Total: {result.total}")
    print(f"  - Successful: {result.successful}")
    print(f"  - Failed: {result.failed}")

    if result.errors:
        print(f"\nErrors:")
        for error in result.errors[:5]:
            print(f"  - {error}")

    if not result.products:
        print("\nNo products to store!")
        sys.exit(1)

    # Store in database
    print(f"\nStoring {len(result.products)} products in Supabase...")
    # Convert to simpler format compatible with existing schema
    products_data = []
    for p in result.products:
        products_data.append({
            "tenant_id": p.tenant_id,
            "id": p.external_id,  # upsert_products_batch adds tenant prefix
            "name": p.name,
            "slug": p.slug,
            "sku": p.sku or "",
            "price": p.price,
            "regular_price": p.regular_price or p.price,
            "sale_price": p.sale_price,
            "stock_status": p.stock_status,
            "stock_quantity": p.stock_quantity,
            "description": p.description or "",
            "short_description": p.short_description or "",
            "categories": p.categories,
            "image_url": p.image_url,
            "permalink": p.permalink or "",
        })
    db_count = db.upsert_products_batch(products_data)
    print(f"  - Stored {db_count} products in database")

    # Store in vector database
    print(f"\nGenerating embeddings and storing in Qdrant...")

    # Prepare for vector storage (format expected by VectorService)
    vector_products = []
    for p in result.products:
        vector_products.append({
            "id": p.external_id,
            "tenant_id": p.tenant_id,
            "name": p.name,
            "short_description": p.short_description or p.description[:200] if p.description else "",
            "price": p.price,
            "image_url": p.image_url,
            "permalink": p.permalink or "",
            "categories": p.categories,
            "stock_status": p.stock_status,
            "combined_text": p.embedding_text,  # Use the pre-built embedding text
        })

    # Generate embeddings and upsert
    try:
        vector_count = vector.upsert_products_batch(vector_products)
        print(f"  - Stored {vector_count} products in vector database")
    except Exception as e:
        print(f"  - Warning: Vector storage failed: {e}")
        print("    (Products are in Supabase, but vector search won't work)")

    print(f"\n{'='*50}")
    print(f"Seeding complete!")
    print(f"  Tenant: {tenant_id}")
    print(f"  Products in DB: {db_count}")
    print(f"{'='*50}")

    # Verify
    print(f"\nVerification:")
    products_in_db = db.get_products(tenant_id, limit=5)
    print(f"  First 5 products:")
    for p in products_in_db:
        print(f"    - {p['name']} (${p['price']})")


if __name__ == "__main__":
    main()
