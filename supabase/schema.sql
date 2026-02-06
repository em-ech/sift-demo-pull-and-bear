-- Sift Retail AI - Supabase Database Schema (v2)
-- Multi-tenant SaaS architecture with full ingestion pipeline support
-- Run this in your Supabase SQL Editor

-- ============================================
-- TENANTS TABLE
-- Stores retailer/store information
-- ============================================
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    config JSONB DEFAULT '{}',
    -- Widget settings
    widget_theme JSONB DEFAULT '{"primaryColor": "#1a1a1a", "fontFamily": "Inter"}',
    -- Subscription/limits
    plan TEXT DEFAULT 'free',  -- free, starter, pro, enterprise
    products_limit INTEGER DEFAULT 1000,
    searches_limit INTEGER DEFAULT 10000,  -- per month
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON tenants(created_at);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON tenants(is_active);

-- ============================================
-- API KEYS TABLE
-- Per-tenant API keys for widget authentication
-- ============================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,  -- SHA256 hash of the actual key
    key_prefix TEXT NOT NULL,  -- First 8 chars for identification (e.g., "sk_live_")
    name TEXT DEFAULT 'Default',
    scopes TEXT[] DEFAULT ARRAY['search', 'chat'],  -- search, chat, admin
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_tenant_id ON api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);

-- ============================================
-- USERS TABLE
-- Dashboard users (retailers/admins)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'member',  -- owner, admin, member
    auth_provider TEXT DEFAULT 'email',  -- email, google, github
    auth_provider_id TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- CONNECTORS TABLE
-- Catalog source configurations
-- ============================================
CREATE TABLE IF NOT EXISTS connectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- api, webhook, csv, woocommerce, shopify
    config JSONB NOT NULL DEFAULT '{}',
    -- For API type: { "base_url", "auth_type", "api_key", "headers" }
    -- For webhook type: { "webhook_secret", "endpoint_path" }
    -- For WooCommerce: { "url", "consumer_key", "consumer_secret" }
    -- For CSV: { "column_mapping": {...}, "delimiter": "," }

    -- Sync settings
    sync_enabled BOOLEAN DEFAULT TRUE,
    sync_frequency TEXT DEFAULT 'daily',  -- manual, hourly, daily, weekly
    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT,  -- success, failed, partial
    last_sync_products_count INTEGER DEFAULT 0,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connectors_tenant_id ON connectors(tenant_id);
CREATE INDEX IF NOT EXISTS idx_connectors_type ON connectors(type);

-- ============================================
-- PRODUCTS TABLE
-- Source of truth for product data
-- ============================================
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,  -- Format: {tenant_id}_{external_id}
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connector_id UUID REFERENCES connectors(id) ON DELETE SET NULL,
    external_id TEXT NOT NULL,

    -- Core product data
    name TEXT NOT NULL,
    slug TEXT,
    sku TEXT,
    brand TEXT,

    -- Pricing
    price DECIMAL(10,2) DEFAULT 0,
    regular_price DECIMAL(10,2) DEFAULT 0,
    sale_price DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',

    -- Inventory
    stock_status TEXT DEFAULT 'instock',  -- instock, outofstock, onbackorder
    stock_quantity INTEGER,

    -- Content
    description TEXT,
    short_description TEXT,

    -- Categorization
    categories TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',

    -- Media
    image_url TEXT,
    gallery_urls TEXT[] DEFAULT '{}',

    -- Links
    permalink TEXT,

    -- Raw data from source (for debugging/re-processing)
    raw_data JSONB,

    -- Embedding input (deterministic product card text)
    embedding_text TEXT,

    -- Sync metadata
    source_updated_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_products_tenant_id ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_external_id ON products(external_id);
CREATE INDEX IF NOT EXISTS idx_products_connector_id ON products(connector_id);
CREATE INDEX IF NOT EXISTS idx_products_categories ON products USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_price ON products(price);

-- ============================================
-- PRODUCT ATTRIBUTES TABLE
-- LLM-derived structured attributes with confidence scores
-- ============================================
CREATE TABLE IF NOT EXISTS product_attributes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Attribute data
    attribute_name TEXT NOT NULL,  -- color, material, style, occasion, season, etc.
    attribute_value TEXT NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,  -- 0.00 to 1.00

    -- Source tracking
    extraction_method TEXT DEFAULT 'llm',  -- llm, rule, manual
    source_field TEXT,  -- which product field this was extracted from

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(product_id, attribute_name)
);

CREATE INDEX IF NOT EXISTS idx_product_attributes_product_id ON product_attributes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_attributes_tenant_id ON product_attributes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_attributes_name_value ON product_attributes(attribute_name, attribute_value);
CREATE INDEX IF NOT EXISTS idx_product_attributes_confidence ON product_attributes(confidence);

-- ============================================
-- INGESTION JOBS TABLE
-- Track catalog ingestion/sync jobs
-- ============================================
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    connector_id UUID REFERENCES connectors(id) ON DELETE SET NULL,

    -- Job type
    job_type TEXT NOT NULL,  -- full_sync, incremental, manual_upload, webhook

    -- Status tracking
    status TEXT DEFAULT 'pending',  -- pending, running, completed, failed, cancelled
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Progress
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    successful_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    skipped_items INTEGER DEFAULT 0,

    -- Results
    error_message TEXT,
    error_details JSONB,
    warnings JSONB DEFAULT '[]',

    -- Metadata
    triggered_by TEXT,  -- user_id, scheduler, webhook
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_tenant_id ON ingestion_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_connector_id ON ingestion_jobs(connector_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_created_at ON ingestion_jobs(created_at DESC);

-- ============================================
-- SEARCH EVENTS TABLE (enhanced from search_logs)
-- Detailed search analytics with click tracking
-- ============================================
CREATE TABLE IF NOT EXISTS search_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Query data
    query TEXT NOT NULL,
    query_embedding_hash TEXT,  -- For caching

    -- Parsed constraints (from query understanding)
    parsed_constraints JSONB,  -- { "budget": 50, "category": "shoes", "style": "casual" }

    -- Results
    results_count INTEGER DEFAULT 0,
    result_product_ids TEXT[] DEFAULT '{}',

    -- User interaction
    session_id TEXT,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Click tracking
    clicked_product_ids TEXT[] DEFAULT '{}',
    clicked_at TIMESTAMPTZ[],

    -- Conversion
    converted BOOLEAN DEFAULT FALSE,
    conversion_value DECIMAL(10,2),

    -- Performance
    latency_ms INTEGER,

    -- Context
    source TEXT DEFAULT 'search_bar',  -- search_bar, chat, api
    device_type TEXT,  -- desktop, mobile, tablet

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_events_tenant_id ON search_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_search_events_created_at ON search_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_events_query ON search_events(query);
CREATE INDEX IF NOT EXISTS idx_search_events_session_id ON search_events(session_id);
CREATE INDEX IF NOT EXISTS idx_search_events_results_count ON search_events(results_count);

-- ============================================
-- ZERO RESULT QUERIES TABLE
-- Aggregated view of queries with no results (demand signals)
-- ============================================
CREATE TABLE IF NOT EXISTS zero_result_queries (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    query_normalized TEXT NOT NULL,  -- Lowercase, trimmed

    -- Aggregated stats
    occurrence_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),

    -- Analysis
    suggested_category TEXT,
    suggested_products TEXT[],  -- Product IDs that might match
    is_reviewed BOOLEAN DEFAULT FALSE,
    review_notes TEXT,

    UNIQUE(tenant_id, query_normalized)
);

CREATE INDEX IF NOT EXISTS idx_zero_result_queries_tenant_id ON zero_result_queries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zero_result_queries_count ON zero_result_queries(occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_zero_result_queries_last_seen ON zero_result_queries(last_seen_at DESC);

-- ============================================
-- CHAT SESSIONS TABLE
-- Track multi-turn chat conversations
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Session data
    messages JSONB DEFAULT '[]',  -- Array of {role, content, timestamp, product_ids}

    -- Outcome
    products_shown TEXT[] DEFAULT '{}',
    products_clicked TEXT[] DEFAULT '{}',
    converted BOOLEAN DEFAULT FALSE,

    -- Metadata
    device_type TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_tenant_id ON chat_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- ============================================
-- LEGACY TABLE MIGRATION
-- Keep search_logs for backwards compatibility
-- ============================================
CREATE TABLE IF NOT EXISTS search_logs (
    id BIGSERIAL PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    results_count INTEGER DEFAULT 0,
    session_id TEXT,
    converted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_tenant_id ON search_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_search_logs_created_at ON search_logs(created_at);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_attributes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE zero_result_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_logs ENABLE ROW LEVEL SECURITY;

-- Service role policies (for backend access)
CREATE POLICY "Service role full access" ON tenants FOR ALL USING (true);
CREATE POLICY "Service role full access" ON api_keys FOR ALL USING (true);
CREATE POLICY "Service role full access" ON users FOR ALL USING (true);
CREATE POLICY "Service role full access" ON connectors FOR ALL USING (true);
CREATE POLICY "Service role full access" ON products FOR ALL USING (true);
CREATE POLICY "Service role full access" ON product_attributes FOR ALL USING (true);
CREATE POLICY "Service role full access" ON ingestion_jobs FOR ALL USING (true);
CREATE POLICY "Service role full access" ON search_events FOR ALL USING (true);
CREATE POLICY "Service role full access" ON zero_result_queries FOR ALL USING (true);
CREATE POLICY "Service role full access" ON chat_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON search_logs FOR ALL USING (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['tenants', 'users', 'connectors', 'products', 'ingestion_jobs'])
    LOOP
        EXECUTE format('
            DROP TRIGGER IF EXISTS update_%s_updated_at ON %s;
            CREATE TRIGGER update_%s_updated_at
                BEFORE UPDATE ON %s
                FOR EACH ROW
                EXECUTE FUNCTION update_updated_at_column();
        ', t, t, t, t);
    END LOOP;
END;
$$;

-- Function to increment zero result query count
CREATE OR REPLACE FUNCTION upsert_zero_result_query(
    p_tenant_id TEXT,
    p_query TEXT
) RETURNS void AS $$
BEGIN
    INSERT INTO zero_result_queries (tenant_id, query, query_normalized)
    VALUES (p_tenant_id, p_query, LOWER(TRIM(p_query)))
    ON CONFLICT (tenant_id, query_normalized)
    DO UPDATE SET
        occurrence_count = zero_result_queries.occurrence_count + 1,
        last_seen_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ANALYTICS VIEWS
-- ============================================

-- Daily search stats per tenant
CREATE OR REPLACE VIEW daily_search_stats AS
SELECT
    tenant_id,
    DATE(created_at) as date,
    COUNT(*) as total_searches,
    COUNT(DISTINCT query) as unique_queries,
    COUNT(*) FILTER (WHERE results_count = 0) as zero_result_searches,
    COUNT(*) FILTER (WHERE array_length(clicked_product_ids, 1) > 0) as searches_with_clicks,
    COUNT(*) FILTER (WHERE converted = true) as conversions,
    AVG(latency_ms) as avg_latency_ms
FROM search_events
GROUP BY tenant_id, DATE(created_at)
ORDER BY date DESC;

-- Top queries per tenant
CREATE OR REPLACE VIEW top_queries AS
SELECT
    tenant_id,
    LOWER(TRIM(query)) as query,
    COUNT(*) as search_count,
    AVG(results_count) as avg_results,
    COUNT(*) FILTER (WHERE array_length(clicked_product_ids, 1) > 0)::float / COUNT(*) as click_rate
FROM search_events
GROUP BY tenant_id, LOWER(TRIM(query))
ORDER BY search_count DESC;

-- Ingestion health per tenant
CREATE OR REPLACE VIEW ingestion_health AS
SELECT
    t.id as tenant_id,
    t.name as tenant_name,
    COUNT(DISTINCT p.id) as total_products,
    COUNT(DISTINCT c.id) as total_connectors,
    MAX(j.completed_at) as last_sync_at,
    (
        SELECT status FROM ingestion_jobs
        WHERE tenant_id = t.id
        ORDER BY created_at DESC LIMIT 1
    ) as last_job_status
FROM tenants t
LEFT JOIN products p ON p.tenant_id = t.id
LEFT JOIN connectors c ON c.tenant_id = t.id
LEFT JOIN ingestion_jobs j ON j.tenant_id = t.id AND j.status = 'completed'
GROUP BY t.id, t.name;

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Insert sample tenant
INSERT INTO tenants (id, name, config, plan)
VALUES ('demo', 'Demo Store', '{"description": "Demo tenant for testing"}', 'free')
ON CONFLICT (id) DO NOTHING;
