# Distributed Tracing Implementation

## Overview

The gateway now implements proper distributed tracing with a hierarchical span tree structure. Each service call and Durable Object call creates a child span that is properly linked to the parent gateway span.

## Span Tree Structure

```
Gateway Request Span (HTTP GET /api/products)
├── AUTH_SERVICE POST /auth/login (child span)
├── PRODUCTS_SERVICE GET /products (child span)
│   └── (Product service can create its own child spans)
├── CartDurableObject POST /cart/add (child span)
│   └── (Cart DO can create its own child spans)
└── ORDER_SERVICE POST /orders (child span)
```

## Implementation Details

### 1. Tracing Middleware (`src/middleware/tracing.middleware.js`)

**Purpose**: Creates child spans for service calls and Durable Object calls

**Key Functions**:

- **`withServiceSpan(serviceName, path, method, operation)`**
  - Creates a child span for each service call
  - Automatically links to parent span (gateway request span)
  - Adds service-specific attributes
  - Records events (start, completion, errors)
  - Sets span status based on response

- **`withDOSpan(doName, doId, path, method, operation)`**
  - Creates a child span for Durable Object calls
  - Links to parent span
  - Adds DO-specific attributes
  - Records DO call lifecycle

**Span Attributes Added**:

- `service.name`: Name of the service
- `http.method`: HTTP method
- `http.url`: API path
- `http.route`: Route pattern
- `http.status_code`: Response status code
- `span.kind`: "client" (outgoing request)
- `durable_object.name`: DO name (for DO spans)
- `durable_object.id`: DO instance ID (for DO spans)

### 2. Service Caller (`src/services/service-caller.js`)

**Changes**:

- Wraps all service calls in `withServiceSpan()`
- Ensures each service call gets its own child span
- Propagates trace context to downstream services
- Records service call metrics

**Trace Context Propagation**:

- Uses OpenTelemetry's `propagation.inject()` to add trace headers
- Headers are automatically picked up by downstream services
- Maintains trace continuity across service boundaries

### 3. Cart Helper (`src/helpers/cart.js`)

**Changes**:

- Wraps Durable Object calls in `withDOSpan()`
- Creates child spans for each DO operation
- Propagates trace context to Durable Objects
- Records DO call metrics

## How It Works

### Request Flow with Tracing

1. **Gateway receives request**
   - `@microlabs/otel-cf-workers` automatically creates root span
   - Span name: HTTP method + route (e.g., "GET /api/products")

2. **Service call made**
   - `callService()` wraps operation in `withServiceSpan()`
   - Creates child span: "AUTH_SERVICE POST /auth/login"
   - Links to parent gateway span
   - Injects trace context into headers

3. **Downstream service receives request**
   - Service should use `@microlabs/otel-cf-workers` for automatic instrumentation
   - Automatically creates child span from propagated context
   - Spans are linked in the trace tree

4. **Durable Object call**
   - `fetchDO()` wraps operation in `withDOSpan()`
   - Creates child span: "CartDurableObject POST /cart/add"
   - Links to parent gateway span
   - Injects trace context

5. **Response returns**
   - Child span records response status
   - Span ends with success/error status
   - Parent span continues

## Span Hierarchy Example

For a request like `POST /api/cart/:cartId/add`:

```
┌─────────────────────────────────────────┐
│ Gateway: POST /api/cart/:cartId/add     │ ← Root span
│ Trace ID: abc123...                     │
│ Span ID: span-1                          │
└─────────────────────────────────────────┘
    │
    ├───┌─────────────────────────────────┐
    │   │ CartDurableObject POST /cart/add │ ← Child span
    │   │ Trace ID: abc123... (same)       │
    │   │ Parent: span-1                    │
    │   │ Span ID: span-2                  │
    │   └─────────────────────────────────┘
    │       │
    │       ├───┌──────────────────────────┐
    │       │   │ PRODUCTS_SERVICE GET      │ ← Nested child
    │       │   │ /products/:id             │   (if DO calls service)
    │       │   │ Trace ID: abc123...       │
    │       │   │ Parent: span-2             │
    │       │   │ Span ID: span-3           │
    │       │   └──────────────────────────┘
    │       │
    │       └───┌──────────────────────────┐
    │           │ FULFILLMENT_SERVICE GET  │ ← Another nested child
    │           │ /shipping-options        │
    │           │ Trace ID: abc123...      │
    │           │ Parent: span-2            │
    │           │ Span ID: span-4          │
    │           └──────────────────────────┘
    │
    └───┌─────────────────────────────────┐
        │ Response sent to client           │
        │ Status: 200 OK                    │
        └─────────────────────────────────┘
```

## Benefits

1. **Complete Request Visibility**: See entire request flow across all services
2. **Performance Analysis**: Identify bottlenecks in service calls
3. **Error Tracking**: Trace errors through the entire system
4. **Service Dependencies**: Understand which services call which other services
5. **Debugging**: Follow a request through the entire system using trace ID

## Viewing Traces

Traces are sent to Honeycomb (or configured OTEL exporter). In Honeycomb:

1. Search by trace ID (from logs)
2. View span tree visualization
3. See timing for each span
4. Identify slow services
5. Debug errors with full context

## Trace Context Propagation

The trace context is propagated via W3C Trace Context headers:

- `traceparent`: Contains trace ID, span ID, and flags
- `tracestate`: Additional trace state (optional)

These headers are automatically:

- **Injected** by the gateway when calling services
- **Extracted** by downstream services (if using `@microlabs/otel-cf-workers`)
- **Maintained** across service boundaries

## Best Practices

1. **Service Instrumentation**: Each service should use `@microlabs/otel-cf-workers` for automatic instrumentation
2. **Span Naming**: Use descriptive names: `{ServiceName} {Method} {Path}`
3. **Error Recording**: Always record exceptions in spans
4. **Status Codes**: Set appropriate span status codes
5. **Attributes**: Add relevant attributes for filtering/searching

## Configuration

The tracing is configured in `src/index.js`:

```javascript
const config = (env, _trigger) => {
	return {
		exporter: {
			url: env.OTEL_EXPORTER_URL || 'https://api.honeycomb.io/v1/traces',
			headers: {
				'x-honeycomb-team': env.HONEYCOMB_API_KEY,
				'x-honeycomb-dataset': env.HONEYCOMB_DATASET,
			},
		},
		service: {
			name: env.SERVICE_NAME || 'ecomm-ms-gateway',
		},
		fetch: {
			enabled: true, // Automatically instrument fetch calls
		},
	};
};
```

## Testing

To verify tracing is working:

1. Check logs for span context:

   ```
   [GATEWAY] Span Context: { traceId: '...', spanId: '...' }
   [GATEWAY] Propagating trace context to AUTH_SERVICE: { traceId: '...', spanId: '...' }
   ```

2. Check Honeycomb for traces:
   - Look for gateway spans
   - Verify child spans are linked
   - Check span hierarchy

3. Verify trace context propagation:
   - Check that downstream services receive trace headers
   - Verify spans are linked in trace tree

## Troubleshooting

**No spans appearing**:

- Check `HONEYCOMB_API_KEY` is set
- Verify `OTEL_EXPORTER_URL` is correct
- Check service is using `@microlabs/otel-cf-workers`

**Spans not linked**:

- Verify trace context propagation headers are being sent
- Check downstream services extract trace context
- Ensure `withServiceSpan()` is being used

**Missing child spans**:

- Verify `withServiceSpan()` wraps service calls
- Check `withDOSpan()` wraps DO calls
- Ensure middleware is imported and used
