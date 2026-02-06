"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  uploadCSV,
  syncWooCommerce,
  getAnalytics,
  getJobs,
  getJob,
  getProducts,
  createApiKey,
  getApiKeys,
  revokeApiKey,
  type Analytics,
  type IngestionJob,
  type ApiKey,
} from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Tab = "overview" | "ingest" | "catalog" | "settings";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [tenantId, setTenantId] = useState("demo");

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [enrichAttributes, setEnrichAttributes] = useState(false);

  // WooCommerce sync state
  const [wcUrl, setWcUrl] = useState("https://vanleeuwenicecream.com");
  const [wcKey, setWcKey] = useState("");
  const [wcSecret, setWcSecret] = useState("");
  const [syncing, setSyncing] = useState(false);

  // Jobs state
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [activeJob, setActiveJob] = useState<IngestionJob | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(false);

  // Analytics state
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Products state
  const [products, setProducts] = useState<Array<{ name: string; price: number; image_url: string | null }>>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("Default");

  // Load jobs
  const loadJobs = useCallback(async () => {
    if (!tenantId) return;
    setLoadingJobs(true);
    try {
      const data = await getJobs(tenantId);
      setJobs(data.jobs || []);
    } catch (error) {
      console.error("Failed to load jobs:", error);
    } finally {
      setLoadingJobs(false);
    }
  }, [tenantId]);

  // Load analytics
  const loadAnalytics = useCallback(async () => {
    if (!tenantId) return;
    setLoadingAnalytics(true);
    try {
      const data = await getAnalytics(tenantId);
      setAnalytics(data);
    } catch (error) {
      console.error("Failed to load analytics:", error);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [tenantId]);

  // Load products
  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoadingProducts(true);
    try {
      const data = await getProducts(tenantId, 50);
      setProducts(data.products || []);
    } catch (error) {
      console.error("Failed to load products:", error);
    } finally {
      setLoadingProducts(false);
    }
  }, [tenantId]);

  // Load API keys
  const loadApiKeys = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await getApiKeys(tenantId);
      setApiKeys(data.api_keys || []);
    } catch (error) {
      console.error("Failed to load API keys:", error);
    }
  }, [tenantId]);

  // Poll active job
  useEffect(() => {
    if (!activeJob || activeJob.status === "completed" || activeJob.status === "failed") {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const data = await getJob(tenantId, activeJob.id);
        setActiveJob(data.job);
        if (data.job.status === "completed" || data.job.status === "failed") {
          loadJobs();
          loadProducts();
        }
      } catch (error) {
        console.error("Failed to poll job:", error);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeJob, tenantId, loadJobs, loadProducts]);

  // Initial load
  useEffect(() => {
    if (tenantId) {
      loadAnalytics();
      loadJobs();
      loadProducts();
      loadApiKeys();
    }
  }, [tenantId, loadAnalytics, loadJobs, loadProducts, loadApiKeys]);

  // Handle file upload
  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !tenantId) return;

    setUploading(true);
    try {
      const result = await uploadCSV(file, tenantId, enrichAttributes);
      // Start polling the job
      const jobData = await getJob(tenantId, result.job_id);
      setActiveJob(jobData.job);
      loadJobs();
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
      setFile(null);
    }
  };

  // Handle WooCommerce sync
  const handleWooCommerceSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wcUrl || !wcKey || !wcSecret || !tenantId) return;

    setSyncing(true);
    try {
      const result = await syncWooCommerce(tenantId, wcUrl, wcKey, wcSecret, enrichAttributes);
      const jobData = await getJob(tenantId, result.job_id);
      setActiveJob(jobData.job);
      loadJobs();
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  // Handle create API key
  const handleCreateApiKey = async () => {
    try {
      const result = await createApiKey(tenantId, keyName);
      setNewApiKey(result.api_key);
      loadApiKeys();
    } catch (error) {
      console.error("Failed to create API key:", error);
    }
  };

  // Handle revoke API key
  const handleRevokeApiKey = async (keyId: string) => {
    if (!confirm("Are you sure you want to revoke this API key?")) return;
    try {
      await revokeApiKey(keyId);
      loadApiKeys();
    } catch (error) {
      console.error("Failed to revoke API key:", error);
    }
  };

  // Prepare chart data
  const topQueriesData =
    analytics?.top_queries?.map(([query, count]) => ({
      query: query.length > 12 ? query.slice(0, 12) + "..." : query,
      count,
    })) || [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-600 bg-green-100";
      case "running": return "text-blue-600 bg-blue-100";
      case "failed": return "text-red-600 bg-red-100";
      case "pending": return "text-yellow-600 bg-yellow-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Sift Retail AI</h1>
            <p className="text-sm text-gray-500">Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-sm text-gray-600">Tenant:</label>
            <Input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-40"
              placeholder="tenant_id"
            />
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b">
        <nav className="flex gap-1 px-6">
          {(["overview", "ingest", "catalog", "settings"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-black text-black"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <main className="p-6 max-w-7xl mx-auto">
        {/* Active Job Banner */}
        {activeJob && (activeJob.status === "running" || activeJob.status === "pending") && (
          <Card className="mb-6 border-blue-200 bg-blue-50">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
                  <div>
                    <p className="font-medium">Ingestion in progress</p>
                    <p className="text-sm text-gray-600">
                      {activeJob.processed_items} / {activeJob.total_items} products processed
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(activeJob.status)}`}>
                  {activeJob.status}
                </span>
              </div>
              {activeJob.total_items > 0 && (
                <div className="mt-3 bg-white rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${(activeJob.processed_items / activeJob.total_items) * 100}%` }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overview Tab */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Total Products</p>
                  <p className="text-3xl font-bold">{analytics?.product_count || products.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Total Searches</p>
                  <p className="text-3xl font-bold">{analytics?.total_searches || 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Click-through Rate</p>
                  <p className="text-3xl font-bold">
                    {((analytics?.click_through_rate || 0) * 100).toFixed(1)}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm text-gray-500">Avg Latency</p>
                  <p className="text-3xl font-bold">{Math.round(analytics?.avg_latency_ms || 0)}ms</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Search Queries</CardTitle>
                </CardHeader>
                <CardContent>
                  {topQueriesData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={topQueriesData.slice(0, 8)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="query" angle={-45} textAnchor="end" height={70} fontSize={12} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#000" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-500 text-center py-12">No search data yet</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Zero-Result Queries (Demand Signals)</CardTitle>
                  <p className="text-sm text-gray-500">What customers want but can&apos;t find</p>
                </CardHeader>
                <CardContent>
                  {analytics?.zero_result_queries && analytics.zero_result_queries.length > 0 ? (
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {analytics.zero_result_queries.slice(0, 10).map((item, i) => {
                        const query = Array.isArray(item) ? item[0] : item.query;
                        const count = Array.isArray(item) ? item[1] : item.occurrence_count;
                        return (
                          <div key={i} className="flex justify-between items-center py-2 border-b">
                            <span className="text-sm">{query}</span>
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">{count}x</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-12">No zero-result queries</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Jobs */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recent Ingestion Jobs</CardTitle>
                <Button variant="outline" size="sm" onClick={loadJobs} disabled={loadingJobs}>
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {jobs.length > 0 ? (
                  <div className="space-y-2">
                    {jobs.slice(0, 5).map((job) => (
                      <div key={job.id} className="flex justify-between items-center py-2 border-b">
                        <div>
                          <span className="font-medium">{job.job_type}</span>
                          <span className="text-sm text-gray-500 ml-2">
                            {new Date(job.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">
                            {job.successful_items} / {job.total_items}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs ${getStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No jobs yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Ingest Tab */}
        {activeTab === "ingest" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Upload Products (CSV/JSON)</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFileUpload} className="space-y-4">
                  <Input
                    type="file"
                    accept=".csv,.json"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={enrichAttributes}
                      onChange={(e) => setEnrichAttributes(e.target.checked)}
                      className="rounded"
                    />
                    Extract attributes with AI (slower, but adds color/material/style)
                  </label>
                  <Button type="submit" disabled={uploading || !file} className="w-full">
                    {uploading ? "Uploading..." : "Upload & Process"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>WooCommerce Sync</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleWooCommerceSync} className="space-y-4">
                  <Input
                    value={wcUrl}
                    onChange={(e) => setWcUrl(e.target.value)}
                    placeholder="Store URL (e.g., https://mystore.com)"
                  />
                  <Input
                    value={wcKey}
                    onChange={(e) => setWcKey(e.target.value)}
                    placeholder="Consumer Key (ck_...)"
                  />
                  <Input
                    type="password"
                    value={wcSecret}
                    onChange={(e) => setWcSecret(e.target.value)}
                    placeholder="Consumer Secret (cs_...)"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={enrichAttributes}
                      onChange={(e) => setEnrichAttributes(e.target.checked)}
                      className="rounded"
                    />
                    Extract attributes with AI
                  </label>
                  <Button type="submit" disabled={syncing || !wcUrl || !wcKey || !wcSecret} className="w-full">
                    {syncing ? "Syncing..." : "Sync Products"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* All Jobs */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>All Ingestion Jobs</CardTitle>
              </CardHeader>
              <CardContent>
                {jobs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Type</th>
                          <th className="text-left py-2">Status</th>
                          <th className="text-left py-2">Progress</th>
                          <th className="text-left py-2">Started</th>
                          <th className="text-left py-2">Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobs.map((job) => (
                          <tr key={job.id} className="border-b">
                            <td className="py-2">{job.job_type}</td>
                            <td className="py-2">
                              <span className={`px-2 py-1 rounded text-xs ${getStatusColor(job.status)}`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="py-2">
                              {job.successful_items}/{job.total_items}
                              {job.failed_items > 0 && (
                                <span className="text-red-500 ml-1">({job.failed_items} failed)</span>
                              )}
                            </td>
                            <td className="py-2 text-gray-500">
                              {job.started_at ? new Date(job.started_at).toLocaleString() : "-"}
                            </td>
                            <td className="py-2 text-gray-500">
                              {job.completed_at ? new Date(job.completed_at).toLocaleString() : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">No jobs yet. Upload a file or sync WooCommerce.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Catalog Tab */}
        {activeTab === "catalog" && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Product Catalog ({products.length} products)</CardTitle>
              <Button variant="outline" size="sm" onClick={loadProducts} disabled={loadingProducts}>
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {products.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {products.map((product, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-24 object-cover rounded mb-2"
                        />
                      ) : (
                        <div className="w-full h-24 bg-gray-100 rounded mb-2 flex items-center justify-center text-gray-400">
                          No image
                        </div>
                      )}
                      <p className="text-sm font-medium truncate">{product.name}</p>
                      <p className="text-sm text-gray-500">${product.price}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-12">
                  No products yet. Go to Ingest tab to upload products.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>API Keys</CardTitle>
                <p className="text-sm text-gray-500">API keys for widget integration</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <Input
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="Key name"
                      className="flex-1"
                    />
                    <Button onClick={handleCreateApiKey}>Create API Key</Button>
                  </div>

                  {newApiKey && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-sm font-medium text-green-800">New API Key Created</p>
                      <p className="text-xs text-green-600 mb-2">Copy this key now - it won&apos;t be shown again!</p>
                      <code className="block p-2 bg-white rounded text-sm break-all">{newApiKey}</code>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => {
                          navigator.clipboard.writeText(newApiKey);
                        }}
                      >
                        Copy to Clipboard
                      </Button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {apiKeys.map((key) => (
                      <div key={key.id} className="flex justify-between items-center p-3 border rounded">
                        <div>
                          <p className="font-medium">{key.name}</p>
                          <p className="text-sm text-gray-500">
                            {key.key_prefix}... | Scopes: {key.scopes.join(", ")}
                          </p>
                          {key.last_used_at && (
                            <p className="text-xs text-gray-400">
                              Last used: {new Date(key.last_used_at).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600"
                          onClick={() => handleRevokeApiKey(key.id)}
                          disabled={!key.is_active}
                        >
                          {key.is_active ? "Revoke" : "Revoked"}
                        </Button>
                      </div>
                    ))}
                    {apiKeys.length === 0 && (
                      <p className="text-gray-500 text-center py-4">No API keys yet</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Widget Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  Add this script to your website to enable the Sift search widget:
                </p>
                <pre className="p-4 bg-gray-100 rounded text-sm overflow-x-auto">
{`<script
  src="https://your-deployment-url/widget.js"
  data-api-key="YOUR_API_KEY"
  data-tenant-id="${tenantId}"
></script>`}
                </pre>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
