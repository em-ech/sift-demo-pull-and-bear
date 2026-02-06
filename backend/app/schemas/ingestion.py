"""
Ingestion Schemas
Pydantic models for ingestion jobs and connectors.
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class ConnectorType(str, Enum):
    API = "api"
    WEBHOOK = "webhook"
    CSV = "csv"
    WOOCOMMERCE = "woocommerce"
    SHOPIFY = "shopify"


class SyncFrequency(str, Enum):
    MANUAL = "manual"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    FULL_SYNC = "full_sync"
    INCREMENTAL = "incremental"
    MANUAL_UPLOAD = "manual_upload"
    WEBHOOK = "webhook"


# Connector schemas
class ConnectorConfig(BaseModel):
    """Base connector configuration."""
    pass


class APIConnectorConfig(ConnectorConfig):
    """Configuration for REST API connectors."""
    base_url: str
    auth_type: str = "bearer"  # bearer, basic, api_key
    api_key: Optional[str] = None
    headers: dict = Field(default_factory=dict)
    products_endpoint: str = "/products"
    pagination_type: str = "offset"  # offset, cursor, page
    page_size: int = 100


class WebhookConnectorConfig(ConnectorConfig):
    """Configuration for webhook-based connectors."""
    webhook_secret: str
    endpoint_path: str = "/webhooks/products"


class WooCommerceConnectorConfig(ConnectorConfig):
    """Configuration for WooCommerce API."""
    url: str
    consumer_key: str
    consumer_secret: str


class CSVConnectorConfig(ConnectorConfig):
    """Configuration for CSV/JSON uploads."""
    column_mapping: dict = Field(default_factory=dict)
    # Maps source columns to our schema:
    # { "Product Name": "name", "Price (USD)": "price", ... }
    delimiter: str = ","
    has_header: bool = True


class ConnectorCreate(BaseModel):
    """Create a new connector."""
    tenant_id: str
    name: str
    type: ConnectorType
    config: dict = Field(default_factory=dict)
    sync_enabled: bool = True
    sync_frequency: SyncFrequency = SyncFrequency.DAILY


class ConnectorResponse(BaseModel):
    """Connector response model."""
    id: str
    tenant_id: str
    name: str
    type: ConnectorType
    config: dict
    sync_enabled: bool
    sync_frequency: SyncFrequency
    last_sync_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None
    last_sync_products_count: int = 0
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


# Ingestion job schemas
class IngestionJobCreate(BaseModel):
    """Create a new ingestion job."""
    tenant_id: str
    connector_id: Optional[str] = None
    job_type: JobType
    triggered_by: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class IngestionJobUpdate(BaseModel):
    """Update an ingestion job."""
    status: Optional[JobStatus] = None
    total_items: Optional[int] = None
    processed_items: Optional[int] = None
    successful_items: Optional[int] = None
    failed_items: Optional[int] = None
    skipped_items: Optional[int] = None
    error_message: Optional[str] = None
    error_details: Optional[dict] = None
    warnings: Optional[list] = None


class IngestionJobResponse(BaseModel):
    """Ingestion job response model."""
    id: str
    tenant_id: str
    connector_id: Optional[str] = None
    job_type: JobType
    status: JobStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_items: int = 0
    processed_items: int = 0
    successful_items: int = 0
    failed_items: int = 0
    skipped_items: int = 0
    error_message: Optional[str] = None
    warnings: list = Field(default_factory=list)
    triggered_by: Optional[str] = None
    created_at: datetime


# Column mapping for CSV uploads
class ColumnMapping(BaseModel):
    """Maps source columns to our product schema."""
    name: str  # Required
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: Optional[str] = None
    regular_price: Optional[str] = None
    sale_price: Optional[str] = None
    sku: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    image_url: Optional[str] = None
    permalink: Optional[str] = None
    stock_status: Optional[str] = None
    stock_quantity: Optional[str] = None
    id: Optional[str] = None


class CSVUploadRequest(BaseModel):
    """Request for CSV upload with column mapping."""
    tenant_id: str
    connector_id: Optional[str] = None
    column_mapping: ColumnMapping
    delimiter: str = ","
