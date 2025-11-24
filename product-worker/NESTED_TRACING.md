# Nested Distributed Tracing Implementation

## Overview

This implementation creates nested/distributed traces that show the complete flow:
1. **Gateway** receives request (root span)
2. **Gateway** calls Product Service (child span via fetch)
3. **Product Service** receives request (child span)
4. **Product Service** handler executes (grandchild span)
5. **Database query** executes (great-grandchild span)

## Trace Structure

```
GET /api/products
├── [Gateway Span] - "GET /api/products"
│   ├── [Fetch Span] - "fetch https://product-worker.../products"
│   │   └── [Product Service Span] - "GET /products"
│   │       ├── [Handler Span] - "handler.getProducts"
│   │       │   └── [DB Query Span] - "db.query.getProducts"
│   │       │       └── [Enrichment Span] - (if any external calls)
│   │       └── [Response Span]
│   └── [Gateway Response]
```

## Implementation Details

### 1. Gateway (`gateway-worker/src/index.js`)
- Uses `@microlabs/otel-cf-workers` with `fetch: { enabled: true }`
- Automatically creates spans for incoming HTTP requests
- **Automatically propagates trace context** via W3C Trace Context headers when calling other services
- No manual trace context propagation needed!

### 2. Product Service (`product-worker/src/index.js`)
- Uses `@microlabs/otel-cf-workers` to receive and continue traces
- Automatically extracts trace context from incoming request headers
- Creates spans for incoming HTTP requests
- Logs trace context for debugging

### 3. Handler Instrumentation (`product-worker/src/handlers/product.handler.js`)
- Wraps handlers with `instrumentOperation()` to create operation-level spans
- Adds attributes like `handler.operation`, `handler.route`, `handler.product_id`
- These spans are children of the HTTP request span

### 4. Database Query Instrumentation (`product-worker/src/db/queries.js`)
- Wraps all DB queries with `instrumentDbQuery()` helper
- Creates spans with attributes:
  - `db.system`: "d1"
  - `db.operation`: Operation name
  - `db.statement`: SQL query
  - `db.duration_ms`: Query duration
  - `db.rows_returned`: Number of rows (for SELECT)
  - `db.success`: Success status (for INSERT/UPDATE/DELETE)

### 5. Tracing Helper (`product-worker/src/helpers/tracing.js`)
- `instrumentDbQuery()`: Creates DB query spans
- `instrumentOperation()`: Creates operation-level spans
- Both automatically:
  - Create child spans in the current trace context
  - Record exceptions
  - Set span status
  - Measure duration

## How Trace Context Propagation Works

1. **Gateway** receives request → Creates root span
2. **Gateway** calls Product Service via `fetch()`:
   - `@microlabs/otel-cf-workers` automatically adds `traceparent` header
   - This header contains: trace ID, span ID, trace flags
3. **Product Service** receives request:
   - `@microlabs/otel-cf-workers` automatically extracts `traceparent` header
   - Creates a child span linked to the gateway span
4. **Product Service** makes DB query:
   - Uses `instrumentDbQuery()` which creates a child span
   - Automatically inherits trace context from active span

## Verification

### Check Logs

When you make a request, you should see:

**Gateway logs:**
```
[GATEWAY] Span Context: { traceId: 'abc123...', spanId: 'def456...', traceFlags: 1 }
[GATEWAY] Request: GET /api/products
```

**Product Service logs:**
```
[PRODUCT] Span Context: { traceId: 'abc123...', spanId: 'ghi789...', traceFlags: 1, isRemote: true }
[PRODUCT] Trace Context Headers: { traceparent: '00-abc123...', tracestate: 'none' }
```

**Important:** Both services should show the **same traceId**! This proves trace context propagation is working.

### Check Honeycomb

1. Go to Honeycomb UI
2. Query for: `service.name:product-worker` or `service.name:ecomm-ms-gateway`
3. You should see:
   - Gateway spans with `http.method`, `http.route`
   - Product service spans with `http.method`, `http.route`
   - Handler spans with `handler.operation`
   - DB query spans with `db.operation`, `db.statement`, `db.duration_ms`

4. Click on a trace to see the nested structure:
   - Gateway span (root)
     - Fetch span (child)
       - Product service span (grandchild)
         - Handler span (great-grandchild)
           - DB query span (great-great-grandchild)

## Adding Tracing to Other Services

To add the same nested tracing to other services:

1. **Install dependencies:**
   ```bash
   npm install @microlabs/otel-cf-workers@^1.0.0-rc.52 @opentelemetry/api@^1.9.0
   ```

2. **Add compatibility flag** to `wrangler.jsonc`:
   ```json
   "compatibility_flags": ["nodejs_compat"]
   ```

3. **Add environment variables:**
   ```json
   "HONEYCOMB_API_KEY": "...",
   "HONEYCOMB_DATASET": "ecomm-msHCTrace",
   "OTEL_EXPORTER_URL": "https://api.honeycomb.io/v1/traces",
   "SERVICE_NAME": "your-service-name"
   ```

4. **Wrap handler** with `instrument()` (like in `product-worker/src/index.js`)

5. **Add DB instrumentation** (if using DB):
   - Copy `src/helpers/tracing.js`
   - Wrap DB queries with `instrumentDbQuery()`

6. **Add handler instrumentation** (optional but recommended):
   - Wrap handlers with `instrumentOperation()`

## Troubleshooting

### Traces not linked?
- Check that both services use the same `HONEYCOMB_DATASET`
- Verify `fetch: { enabled: true }` in both gateway and service configs
- Check logs for `traceparent` header presence

### DB spans not showing?
- Verify `instrumentDbQuery()` is wrapping all DB calls
- Check that spans are being created (look for span context in logs)
- Ensure `@opentelemetry/api` is installed

### Trace ID is all zeros?
- Check `compatibility_flags: ["nodejs_compat"]` is set
- Verify `@microlabs/otel-cf-workers` is installed
- Check that `instrument()` is wrapping the handler

