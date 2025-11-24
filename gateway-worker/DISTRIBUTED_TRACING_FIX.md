# Distributed Tracing Fix - Nested Traces

## Problem

Traces are appearing separately instead of nested:

- Gateway trace: `GET /api/products` (2 spans)
- Product service trace: `GET /products` (2 spans) - **Separate trace ID**

## Root Cause

Trace context is not being propagated from Gateway → Product Service, causing each service to create a new trace instead of continuing the existing one.

## Solution Implemented

### 1. Manual Trace Context Propagation (`service-caller.js`)

Added manual trace context injection for service bindings:

```javascript
import { trace, context, propagation } from '@opentelemetry/api';

// Get active span and inject trace context
const activeSpan = trace.getActiveSpan();
if (activeSpan) {
	propagation.inject(context.active(), reqHeaders, {
		set: (carrier, key, value) => {
			carrier[key] = value;
		},
	});
}
```

**Why?** Service bindings (`serviceBinding.fetch()`) may not be automatically instrumented by `@microlabs/otel-cf-workers`, so we manually inject the `traceparent` header.

### 2. Automatic Propagation for URL-based Calls

When using `fetch()` with URLs, `@microlabs/otel-cf-workers` automatically:

- Creates a child span
- Injects `traceparent` header
- Links spans in the same trace

### 3. Product Service Extraction

The product service (`@microlabs/otel-cf-workers`) automatically:

- Extracts `traceparent` header from incoming requests
- Creates a child span linked to the parent trace
- Continues the trace context

## Expected Trace Structure

After the fix, you should see:

```
Trace ID: abc123... (single trace for entire flow)
├── [Gateway] "GET /api/products" (root span)
│   ├── [Gateway Fetch] "fetch product-worker" (child span)
│   │   └── [Product Service] "GET /products" (grandchild span)
│   │       ├── [Handler] "handler.getProducts" (great-grandchild)
│   │       │   └── [DB Query] "db.query.getProducts" (great-great-grandchild)
│   │       └── [Enrichment] (if any external calls)
│   └── [Gateway Response]
```

## Verification Steps

### 1. Check Logs

**Gateway logs should show:**

```
[GATEWAY] Span Context: { traceId: 'abc123...', spanId: 'def456...' }
[GATEWAY] Propagating trace context to PRODUCTS_SERVICE: { traceId: 'abc123...', spanId: 'def456...' }
```

**Product Service logs should show:**

```
[PRODUCT] Trace Context Headers: { traceparent: '00-abc123...', tracestate: 'none' }
[PRODUCT] Span Context: { traceId: 'abc123...', spanId: 'ghi789...', isRemote: true }
```

**Key:** Both should show the **SAME traceId** (`abc123...`)!

### 2. Check Honeycomb

1. Go to Honeycomb UI
2. Query for: `service.name:ecomm-ms-gateway` OR `service.name:product-worker`
3. You should see:
   - **Single trace** with multiple spans
   - Gateway span as root
   - Product service span as child
   - Handler and DB spans as nested children

4. Click on a trace to see the nested structure:
   - All spans should be in the same trace
   - Spans should show parent-child relationships

### 3. Verify Trace Count

Before fix: Each service creates separate traces (2 spans each)
After fix: Single trace with 5+ spans (gateway + product + handler + DB)

## Troubleshooting

### Still seeing separate traces?

1. **Check trace IDs in logs:**
   - Gateway and Product service should log the same traceId
   - If different, trace context propagation failed

2. **Check for `traceparent` header:**
   - Product service logs should show `traceparent` header
   - If missing, propagation isn't working

3. **Verify service binding vs URL:**
   - Service bindings: Manual propagation (what we added)
   - URLs: Automatic propagation (should work)
   - Check which method is being used in logs

4. **Check dataset:**
   - Both services must use the same `HONEYCOMB_DATASET`
   - Different datasets = separate traces in UI

5. **Verify OpenTelemetry config:**
   - Both services must have `fetch: { enabled: true }`
   - Both must have `compatibility_flags: ["nodejs_compat"]`

## Best Practices

### ✅ DO:

- Use the same `HONEYCOMB_DATASET` for all services
- Ensure all services use `@microlabs/otel-cf-workers`
- Check logs to verify trace context propagation
- Use service bindings when possible (better performance)

### ❌ DON'T:

- Use different datasets per service
- Skip `compatibility_flags: ["nodejs_compat"]`
- Mix manual and automatic instrumentation incorrectly
- Forget to check trace IDs match across services

## Next Steps

Once this is working for Gateway → Product Service:

1. Apply the same pattern to other services (Auth, Order, etc.)
2. Add DB instrumentation to all services
3. Add handler instrumentation for better visibility
4. Monitor trace completeness in Honeycomb
