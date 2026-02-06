"""
Product Schemas
Pydantic models for product data throughout the pipeline.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class StockStatus(str, Enum):
    IN_STOCK = "instock"
    OUT_OF_STOCK = "outofstock"
    ON_BACKORDER = "onbackorder"


class ProductRaw(BaseModel):
    """Raw product data from any source (API, CSV, webhook)."""
    id: str
    name: str
    description: Optional[str] = ""
    short_description: Optional[str] = ""
    price: Optional[float] = 0
    regular_price: Optional[float] = None
    sale_price: Optional[float] = None
    currency: str = "USD"
    sku: Optional[str] = ""
    brand: Optional[str] = ""
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None
    gallery_urls: list[str] = Field(default_factory=list)
    permalink: Optional[str] = ""
    stock_status: StockStatus = StockStatus.IN_STOCK
    stock_quantity: Optional[int] = None
    raw_data: Optional[dict] = None


class ProductNormalized(ProductRaw):
    """Product after normalization stage."""
    tenant_id: str
    connector_id: Optional[str] = None
    slug: str = ""
    # Cleaned text fields
    description_clean: str = ""
    short_description_clean: str = ""


class ExtractedAttribute(BaseModel):
    """A single extracted attribute with confidence score."""
    name: str  # color, material, style, occasion, season, fit, etc.
    value: str
    confidence: float = Field(ge=0.0, le=1.0)
    source_field: str = "description"  # Which field it was extracted from


class ProductEnriched(ProductNormalized):
    """Product after enrichment (attribute extraction)."""
    attributes: list[ExtractedAttribute] = Field(default_factory=list)
    embedding_text: str = ""  # Deterministic product card text for embedding


class ProductCreate(BaseModel):
    """Product ready for database insertion."""
    id: str  # {tenant_id}_{external_id}
    tenant_id: str
    connector_id: Optional[str] = None
    external_id: str
    name: str
    slug: str
    sku: Optional[str] = ""
    brand: Optional[str] = ""
    price: float = 0
    regular_price: float = 0
    sale_price: Optional[float] = None
    currency: str = "USD"
    stock_status: str = "instock"
    stock_quantity: Optional[int] = None
    description: Optional[str] = ""
    short_description: Optional[str] = ""
    categories: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    image_url: Optional[str] = None
    gallery_urls: list[str] = Field(default_factory=list)
    permalink: Optional[str] = ""
    raw_data: Optional[dict] = None
    embedding_text: str = ""


class ProductAttributeCreate(BaseModel):
    """Attribute ready for database insertion."""
    product_id: str
    tenant_id: str
    attribute_name: str
    attribute_value: str
    confidence: float
    extraction_method: str = "llm"
    source_field: Optional[str] = None
