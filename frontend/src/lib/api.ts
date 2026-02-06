/**
 * API Client for Sift Retail AI Backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ==================== TYPES ====================

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Product {
  product_id: string;
  name: string;
  price: number;
  description: string;
  image_url: string | null;
  permalink: string;
  categories: string[];
  stock_status: string;
  score?: number;
}

export interface ChatResponse {
  response: string;
  products: Product[];
  products_count: number;
}

export interface SearchResponse {
  results: Product[];
  count: number;
  query_understanding?: {
    budget_max?: number;
    budget_min?: number;
    category?: string;
    brand?: string;
    color?: string;
    style?: string;
    search_intent?: string;
  };
  search_event_id?: number;
  latency_ms: number;
}

export interface Analytics {
  total_searches: number;
  unique_queries: number;
  searches_with_results?: number;
  searches_with_clicks?: number;
  zero_result_rate?: number;
  click_through_rate?: number;
  avg_latency_ms?: number;
  zero_result_queries: Array<{ query: string; occurrence_count: number } | [string, number]>;
  top_queries: Array<[string, number]>;
  conversion_rate: number;
  product_count?: number;
}

export interface Tenant {
  id: string;
  name: string;
  config: Record<string, unknown>;
  plan?: string;
  products_limit?: number;
  is_active: boolean;
  created_at: string;
}

export interface Connector {
  id: string;
  tenant_id: string;
  name: string;
  type: "api" | "webhook" | "csv" | "woocommerce" | "shopify";
  config: Record<string, unknown>;
  sync_enabled: boolean;
  sync_frequency: string;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_products_count: number;
  is_active: boolean;
  created_at: string;
}

export interface IngestionJob {
  id: string;
  tenant_id: string;
  connector_id: string | null;
  job_type: "full_sync" | "incremental" | "manual_upload" | "webhook";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  started_at: string | null;
  completed_at: string | null;
  total_items: number;
  processed_items: number;
  successful_items: number;
  failed_items: number;
  skipped_items: number;
  error_message: string | null;
  warnings: string[];
  triggered_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ApiKey {
  id: string;
  tenant_id: string;
  key_prefix: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

// ==================== CHAT & SEARCH ====================

export async function sendChatMessage(
  message: string,
  tenantId: string,
  storeName: string = "our store",
  history: ChatMessage[] = [],
  sessionId?: string
): Promise<ChatResponse> {
  const response = await fetch(`${API_URL}/chat/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      tenant_id: tenantId,
      store_name: storeName,
      history,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat error: ${response.statusText}`);
  }

  return response.json();
}

export async function searchProducts(
  query: string,
  tenantId: string,
  topK: number = 5,
  useQueryUnderstanding: boolean = true,
  sessionId?: string
): Promise<SearchResponse> {
  const response = await fetch(`${API_URL}/search/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      tenant_id: tenantId,
      top_k: topK,
      use_query_understanding: useQueryUnderstanding,
      session_id: sessionId,
    }),
  });

  if (!response.ok) {
    throw new Error(`Search error: ${response.statusText}`);
  }

  return response.json();
}

export async function trackClick(
  searchEventId: number,
  productId: string,
  tenantId: string
): Promise<void> {
  await fetch(`${API_URL}/search/track-click`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      search_event_id: searchEventId,
      product_id: productId,
      tenant_id: tenantId,
    }),
  });
}

// ==================== TENANTS ====================

export async function createTenant(
  tenantId: string,
  name: string
): Promise<{ success: boolean; tenant: Tenant }> {
  const response = await fetch(`${API_URL}/admin/tenants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId, name }),
  });

  if (!response.ok) {
    throw new Error(`Create tenant error: ${response.statusText}`);
  }

  return response.json();
}

export async function getTenants(): Promise<{ tenants: Tenant[] }> {
  const response = await fetch(`${API_URL}/admin/tenants`);

  if (!response.ok) {
    throw new Error(`Get tenants error: ${response.statusText}`);
  }

  return response.json();
}

export async function getTenant(tenantId: string): Promise<{ tenant: Tenant }> {
  const response = await fetch(`${API_URL}/admin/tenants/${tenantId}`);

  if (!response.ok) {
    throw new Error(`Get tenant error: ${response.statusText}`);
  }

  return response.json();
}

// ==================== CONNECTORS ====================

export async function createConnector(
  tenantId: string,
  name: string,
  type: Connector["type"],
  config: Record<string, unknown> = {},
  syncFrequency: string = "daily"
): Promise<{ success: boolean; connector: Connector }> {
  const response = await fetch(`${API_URL}/admin/connectors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      name,
      type,
      config,
      sync_frequency: syncFrequency,
    }),
  });

  if (!response.ok) {
    throw new Error(`Create connector error: ${response.statusText}`);
  }

  return response.json();
}

export async function getConnectors(
  tenantId: string
): Promise<{ connectors: Connector[] }> {
  const response = await fetch(`${API_URL}/admin/connectors/${tenantId}`);

  if (!response.ok) {
    throw new Error(`Get connectors error: ${response.statusText}`);
  }

  return response.json();
}

export async function deleteConnector(connectorId: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/connectors/${connectorId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Delete connector error: ${response.statusText}`);
  }
}

// ==================== INGESTION JOBS ====================

export async function getJobs(
  tenantId: string,
  limit: number = 20
): Promise<{ jobs: IngestionJob[] }> {
  const response = await fetch(
    `${API_URL}/admin/jobs/${tenantId}?limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Get jobs error: ${response.statusText}`);
  }

  return response.json();
}

export async function getJob(
  tenantId: string,
  jobId: string
): Promise<{ job: IngestionJob }> {
  const response = await fetch(`${API_URL}/admin/jobs/${tenantId}/${jobId}`);

  if (!response.ok) {
    throw new Error(`Get job error: ${response.statusText}`);
  }

  return response.json();
}

// ==================== PRODUCT INGESTION ====================

export async function uploadCSV(
  file: File,
  tenantId: string,
  enrichAttributes: boolean = false
): Promise<{ success: boolean; job_id: string; products_queued: number; message: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("tenant_id", tenantId);
  formData.append("enrich_attributes", enrichAttributes.toString());

  const response = await fetch(`${API_URL}/admin/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload error: ${response.statusText}`);
  }

  return response.json();
}

export async function syncWooCommerce(
  tenantId: string,
  woocommerceUrl: string,
  consumerKey: string,
  consumerSecret: string,
  enrichAttributes: boolean = false
): Promise<{ success: boolean; job_id: string; products_queued: number; message: string }> {
  const response = await fetch(`${API_URL}/admin/sync/woocommerce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      woocommerce_url: woocommerceUrl,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      enrich_attributes: enrichAttributes,
    }),
  });

  if (!response.ok) {
    throw new Error(`Sync error: ${response.statusText}`);
  }

  return response.json();
}

// ==================== API KEYS ====================

export async function createApiKey(
  tenantId: string,
  name: string = "Default"
): Promise<{ success: boolean; api_key: string; key_info: { id: string; prefix: string; name: string }; warning: string }> {
  const response = await fetch(`${API_URL}/admin/api-keys/${tenantId}?name=${encodeURIComponent(name)}`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Create API key error: ${response.statusText}`);
  }

  return response.json();
}

export async function getApiKeys(
  tenantId: string
): Promise<{ api_keys: ApiKey[] }> {
  const response = await fetch(`${API_URL}/admin/api-keys/${tenantId}`);

  if (!response.ok) {
    throw new Error(`Get API keys error: ${response.statusText}`);
  }

  return response.json();
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const response = await fetch(`${API_URL}/admin/api-keys/${keyId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Revoke API key error: ${response.statusText}`);
  }
}

// ==================== ANALYTICS ====================

export async function getAnalytics(
  tenantId: string,
  days: number = 30
): Promise<Analytics> {
  const response = await fetch(
    `${API_URL}/admin/analytics/${tenantId}?days=${days}`
  );

  if (!response.ok) {
    throw new Error(`Analytics error: ${response.statusText}`);
  }

  return response.json();
}

export async function getZeroResultQueries(
  tenantId: string,
  limit: number = 50
): Promise<{ zero_result_queries: Array<{ query: string; occurrence_count: number; last_seen_at: string }> }> {
  const response = await fetch(
    `${API_URL}/admin/analytics/${tenantId}/zero-results?limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Zero results error: ${response.statusText}`);
  }

  return response.json();
}

// ==================== PRODUCTS ====================

export async function getProducts(
  tenantId: string,
  limit: number = 100
): Promise<{ products: Product[]; count: number }> {
  const response = await fetch(
    `${API_URL}/admin/products/${tenantId}?limit=${limit}`
  );

  if (!response.ok) {
    throw new Error(`Products error: ${response.statusText}`);
  }

  return response.json();
}

// ==================== HEALTH ====================

export async function checkHealth(): Promise<{
  status: string;
  services: Record<string, boolean>;
}> {
  const response = await fetch(`${API_URL}/health`);
  return response.json();
}
