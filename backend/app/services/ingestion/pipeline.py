"""
Ingestion Pipeline
Orchestrates the full product ingestion flow.
"""

from typing import Optional, Callable
from datetime import datetime

from app.schemas.product import (
    ProductRaw,
    ProductNormalized,
    ProductEnriched,
    ProductCreate,
    ProductAttributeCreate,
)
from app.schemas.ingestion import JobStatus, JobType
from .normalizer import ProductNormalizer, normalizer
from .attribute_extractor import AttributeExtractor, attribute_extractor
from .embedding_builder import EmbeddingTextBuilder, embedding_builder


class IngestionResult:
    """Result of an ingestion pipeline run."""

    def __init__(self):
        self.total = 0
        self.successful = 0
        self.failed = 0
        self.skipped = 0
        self.products: list[ProductCreate] = []
        self.attributes: list[ProductAttributeCreate] = []
        self.errors: list[dict] = []
        self.warnings: list[str] = []

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "successful": self.successful,
            "failed": self.failed,
            "skipped": self.skipped,
            "errors": self.errors,
            "warnings": self.warnings,
        }


class IngestionPipeline:
    """
    Full product ingestion pipeline.

    Pipeline stages:
    1. Normalize - Clean and standardize product data
    2. Enrich - Extract structured attributes with LLM
    3. Build Embedding Text - Create deterministic text for vectors
    4. Prepare for Storage - Convert to database-ready format
    """

    def __init__(
        self,
        normalizer: ProductNormalizer = None,
        extractor: AttributeExtractor = None,
        builder: EmbeddingTextBuilder = None,
        confidence_threshold: float = 0.7,
        skip_enrichment: bool = False,
        use_rule_extraction: bool = False,
    ):
        self.normalizer = normalizer or ProductNormalizer()
        self.extractor = extractor or AttributeExtractor(confidence_threshold)
        self.builder = builder or EmbeddingTextBuilder()
        self.skip_enrichment = skip_enrichment
        self.use_rule_extraction = use_rule_extraction

    def process(
        self,
        raw_products: list[ProductRaw],
        tenant_id: str,
        connector_id: Optional[str] = None,
        progress_callback: Optional[Callable[[int, int], None]] = None,
    ) -> IngestionResult:
        """
        Process a batch of raw products through the full pipeline.

        Args:
            raw_products: List of raw product data
            tenant_id: Tenant ID for these products
            connector_id: Optional connector ID
            progress_callback: Optional callback(processed, total) for progress updates

        Returns:
            IngestionResult with processed products and stats
        """
        result = IngestionResult()
        result.total = len(raw_products)

        if not raw_products:
            return result

        # Stage 1: Normalize
        normalized_products = []
        for i, raw in enumerate(raw_products):
            try:
                normalized = self.normalizer.normalize(raw, tenant_id, connector_id)
                normalized_products.append(normalized)
            except Exception as e:
                result.failed += 1
                result.errors.append({
                    "product_id": raw.id,
                    "stage": "normalize",
                    "error": str(e),
                })
                continue

            if progress_callback and i % 10 == 0:
                progress_callback(i, result.total)

        # Stage 2: Enrich (attribute extraction)
        attributes_map: dict[str, list] = {}

        if not self.skip_enrichment:
            for product in normalized_products:
                try:
                    if self.use_rule_extraction:
                        attrs = self.extractor.extract_from_rules(product)
                    else:
                        attrs = self.extractor.extract(product)
                    attributes_map[product.id] = attrs
                except Exception as e:
                    # Enrichment failure is non-fatal
                    result.warnings.append(
                        f"Attribute extraction failed for {product.id}: {e}"
                    )
                    attributes_map[product.id] = []
        else:
            # No enrichment - empty attributes for all
            for product in normalized_products:
                attributes_map[product.id] = []

        # Stage 3: Build embedding text
        enriched_products = self.builder.build_batch(normalized_products, attributes_map)

        # Stage 4: Prepare for storage
        for enriched in enriched_products:
            try:
                # Convert to database-ready format
                product_create = ProductCreate(
                    id=f"{tenant_id}_{enriched.id}",
                    tenant_id=tenant_id,
                    connector_id=connector_id,
                    external_id=enriched.id,
                    name=enriched.name,
                    slug=enriched.slug,
                    sku=enriched.sku,
                    brand=enriched.brand,
                    price=enriched.price,
                    regular_price=enriched.regular_price,
                    sale_price=enriched.sale_price,
                    currency=enriched.currency,
                    stock_status=enriched.stock_status.value,
                    stock_quantity=enriched.stock_quantity,
                    description=enriched.description,
                    short_description=enriched.short_description,
                    categories=enriched.categories,
                    tags=enriched.tags,
                    image_url=enriched.image_url,
                    gallery_urls=enriched.gallery_urls,
                    permalink=enriched.permalink,
                    raw_data=enriched.raw_data,
                    embedding_text=enriched.embedding_text,
                )
                result.products.append(product_create)

                # Convert attributes
                for attr in enriched.attributes:
                    attr_create = ProductAttributeCreate(
                        product_id=product_create.id,
                        tenant_id=tenant_id,
                        attribute_name=attr.name,
                        attribute_value=attr.value,
                        confidence=attr.confidence,
                        extraction_method="llm" if not self.use_rule_extraction else "rule",
                        source_field=attr.source_field,
                    )
                    result.attributes.append(attr_create)

                result.successful += 1

            except Exception as e:
                result.failed += 1
                result.errors.append({
                    "product_id": enriched.id,
                    "stage": "prepare",
                    "error": str(e),
                })

        if progress_callback:
            progress_callback(result.total, result.total)

        return result

    def process_single(
        self,
        raw_product: ProductRaw,
        tenant_id: str,
        connector_id: Optional[str] = None,
    ) -> tuple[Optional[ProductCreate], list[ProductAttributeCreate], Optional[str]]:
        """
        Process a single product through the pipeline.

        Returns:
            Tuple of (product, attributes, error_message)
        """
        result = self.process([raw_product], tenant_id, connector_id)

        if result.products:
            return result.products[0], result.attributes, None
        elif result.errors:
            return None, [], result.errors[0].get("error", "Unknown error")
        else:
            return None, [], "No product processed"


# Factory functions for common configurations
def create_fast_pipeline() -> IngestionPipeline:
    """Create a fast pipeline with no LLM enrichment."""
    return IngestionPipeline(
        skip_enrichment=True,
    )


def create_rule_pipeline() -> IngestionPipeline:
    """Create a pipeline with rule-based extraction (no LLM)."""
    return IngestionPipeline(
        use_rule_extraction=True,
    )


def create_full_pipeline(confidence_threshold: float = 0.7) -> IngestionPipeline:
    """Create a full pipeline with LLM enrichment."""
    return IngestionPipeline(
        confidence_threshold=confidence_threshold,
    )


# Default pipeline instance
pipeline = create_fast_pipeline()
