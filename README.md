# Sift Retail AI v2

A multi-tenant SaaS platform for AI-powered product discovery.

## Core Features

- **Semantic Search** - Natural language product search with query understanding
- **AI Chat Assistant** - Multi-turn shopping conversations
- **Multi-Tenant** - Complete data isolation between retailers
- **Catalog Ingestion** - CSV/JSON upload, WooCommerce sync, API connectors
- **LLM Enrichment** - Automatic attribute extraction (color, material, style)
- **Analytics Dashboard** - Search metrics, zero-result queries, click tracking
- **Embeddable Widgets** - Drop-in search bar and chat widgets

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend API | FastAPI (Python 3.12, uv) |
| Frontend Dashboard | Next.js 16 + Tailwind |
| Vector Database | Qdrant |
| Relational Database | Supabase (Postgres) |
| AI/ML | OpenAI (GPT-4o, text-embedding-3-small) |
| Deployment | Railway |

## Project Structure

```
siftopsv2/
├── backend/                    # FastAPI backend
│   ├── app/
│   │   ├── main.py            # Entry point
│   │   ├── core/              # Configuration
│   │   ├── routes/            # API endpoints (search, chat, admin)
│   │   ├── services/          # Business logic
│   │   │   ├── ingestion/     # Pipeline (normalize, enrich, embed)
│   │   │   ├── vector_service.py
│   │   │   ├── db_service.py
│   │   │   ├── query_service.py
│   │   │   └── job_service.py
│   │   └── schemas/           # Pydantic models
│   ├── scripts/               # Utility scripts
│   └── data/                  # Sample data
├── frontend/                   # Next.js dashboard
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/         # Dashboard pages
│   │   │   └── shop-demo/     # Demo storefront
│   │   ├── components/        # UI components
│   │   └── lib/               # API client
│   └── public/
│       ├── sift-search-widget.js
│       └── sift-chat-widget.js
├── supabase/
│   └── schema.sql             # Database schema
└── ui/                        # Demo storefront (Van Leeuwen)
```

## Quick Start

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys

# Install dependencies
uv sync

# Run the server
uv run uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup

```bash
cd frontend
cp .env.example .env.local
# Edit .env.local with NEXT_PUBLIC_API_URL=http://localhost:8000

npm install
npm run dev
```

### 3. Database Setup

1. Create a [Supabase](https://supabase.com) project
2. Run `supabase/schema.sql` in the SQL Editor
3. Copy URL and anon key to `backend/.env`

### 4. Qdrant Setup

**Option A: Qdrant Cloud (Recommended)**
1. Create a [Qdrant Cloud](https://cloud.qdrant.io) cluster
2. Copy URL and API key to `backend/.env`

**Option B: Local (In-Memory)**
- The backend falls back to in-memory Qdrant if not configured

## Environment Variables

### Backend (.env)

```
OPENAI_API_KEY=sk-...
QDRANT_URL=https://xxx.cloud.qdrant.io:6333
QDRANT_API_KEY=...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=...

# Optional: WooCommerce defaults
WOOCOMMERCE_URL=https://mystore.com
WOOCOMMERCE_CONSUMER_KEY=ck_...
WOOCOMMERCE_CONSUMER_SECRET=cs_...
```

### Frontend (.env.local)

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## API Endpoints

### Search

```bash
# Semantic search with query understanding
POST /search/
{
  "query": "blue dress under $50",
  "tenant_id": "demo",
  "top_k": 5,
  "use_query_understanding": true
}

# Response includes parsed constraints
{
  "results": [...],
  "count": 5,
  "query_understanding": {
    "budget_max": 50,
    "color": "blue",
    "category": "dress"
  },
  "search_event_id": 123,
  "latency_ms": 150
}
```

### Chat

```bash
POST /chat/
{
  "message": "I need a gift for my mom",
  "tenant_id": "demo",
  "store_name": "Demo Store"
}
```

### Admin - Upload Products

```bash
# CSV/JSON upload
POST /admin/upload
Content-Type: multipart/form-data
file: products.csv
tenant_id: demo
enrich_attributes: false

# Returns job_id for tracking
{
  "success": true,
  "job_id": "uuid",
  "products_queued": 100,
  "message": "Check /admin/jobs/demo/uuid for status"
}
```

### Admin - WooCommerce Sync

```bash
POST /admin/sync/woocommerce
{
  "tenant_id": "demo",
  "woocommerce_url": "https://mystore.com",
  "consumer_key": "ck_...",
  "consumer_secret": "cs_...",
  "enrich_attributes": true
}
```

### Admin - Jobs

```bash
# List jobs
GET /admin/jobs/{tenant_id}

# Get job status
GET /admin/jobs/{tenant_id}/{job_id}
```

### Admin - API Keys

```bash
# Create API key for widgets
POST /admin/api-keys/{tenant_id}?name=Production

# List keys
GET /admin/api-keys/{tenant_id}

# Revoke key
DELETE /admin/api-keys/{key_id}
```

### Admin - Analytics

```bash
GET /admin/analytics/{tenant_id}?days=30
```

## Widget Integration

### Search Widget

Add to your website:

```html
<div id="sift-search"></div>
<script
  src="https://your-deployment/sift-search-widget.js"
  data-api-key="sk_live_..."
  data-tenant-id="your-tenant"
  data-container="#sift-search"
  data-theme="light"
></script>
```

### Chat Widget

Add to your website:

```html
<script
  src="https://your-deployment/sift-chat-widget.js"
  data-api-key="sk_live_..."
  data-tenant-id="your-tenant"
  data-store-name="Your Store"
  data-position="bottom-right"
  data-primary-color="#000000"
></script>
```

## Ingestion Pipeline

The pipeline processes products through these stages:

1. **Normalize** - Clean HTML, standardize prices, generate slugs
2. **Enrich** (optional) - LLM extracts attributes (color, material, style) with confidence scores
3. **Build Embedding Text** - Deterministic "product card" for consistent embeddings
4. **Vectorize** - Generate embeddings with OpenAI
5. **Store** - Upsert to Supabase (truth) + Qdrant (vectors)

### CSV Format

```csv
name,description,price,category,image_url,sku,brand
"Blue Cotton Dress","A beautiful summer dress...",49.99,Dresses,https://...,SKU001,MyBrand
```

## Database Schema

Key tables:

- `tenants` - Retailer accounts with plans/limits
- `products` - Source of truth for product data
- `product_attributes` - LLM-derived attributes with confidence
- `connectors` - Catalog source configurations
- `ingestion_jobs` - Job tracking for async ingestion
- `api_keys` - Per-tenant widget authentication
- `search_events` - Full search analytics with clicks
- `zero_result_queries` - Demand signals

## Deployment (Railway)

1. Create Railway project
2. Add services:
   - **api**: FastAPI backend
   - **frontend**: Next.js dashboard
   - **qdrant**: Qdrant container (optional, can use Qdrant Cloud)

3. Environment variables:
   - Set all backend env vars in api service
   - Set `NEXT_PUBLIC_API_URL` in frontend service

4. Build commands:
   - api: `pip install uv && uv sync`
   - api start: `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - frontend: `npm install && npm run build`
   - frontend start: `npm start`

## Security

- **Tenant Isolation**: All queries include hard `tenant_id` filters at database level
- **API Keys**: Hashed storage, scoped permissions, revocable
- **RAG Guardrails**: LLM can only reference retrieved products (zero hallucination)
- **RLS**: Row-level security enabled on all tables

---

Built for the Venture bootcamp.
