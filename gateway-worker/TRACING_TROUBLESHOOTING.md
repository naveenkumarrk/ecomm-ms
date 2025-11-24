# Tracing Troubleshooting Guide

## Quick Checks

### 1. Verify Environment Variables

Check your `wrangler.jsonc` or deployed environment has:

- ✅ `HONEYCOMB_API_KEY` - Your Honeycomb API key
- ✅ `HONEYCOMB_DATASET` - Your dataset name (e.g., "ecomm-msHCTrace")
- ✅ `OTEL_EXPORTER_URL` - Should be "https://api.honeycomb.io/v1/traces"
- ✅ `SERVICE_NAME` - Service identifier

### 2. Check Worker Logs

When you make a request, you should see:

```
[GATEWAY] Initializing OpenTelemetry config...
[GATEWAY] HONEYCOMB_API_KEY present: true
[GATEWAY] HONEYCOMB_DATASET: ecomm-msHCTrace
[GATEWAY] Span Context: { traceId: '...', spanId: '...', traceFlags: 1 }
```

**If you see `traceId: '00000000000000000000000000000000'`** - Tracing is NOT initialized correctly.

**If you see `No active span found!`** - The instrument function isn't creating spans.

### 3. Verify Compatibility Flag

Your `wrangler.jsonc` must have:

```json
"compatibility_flags": ["nodejs_compat"]
```

### 4. Test Locally

```bash
cd ecomm-ms/gateway-worker
npm run dev
```

Then make a request and check:

1. Console logs for span context
2. Any error messages
3. Network tab for requests to `api.honeycomb.io`

### 5. Verify Honeycomb Setup

1. Go to https://ui.honeycomb.io
2. Check your dataset exists: `ecomm-msHCTrace`
3. Verify your API key has write permissions
4. Check if there are any rate limits or quotas

### 6. Check for Common Issues

#### Issue: Spans not being created

- **Symptom**: `No active span found!` in logs
- **Fix**: Ensure `@microlabs/otel-cf-workers` is installed and `instrument()` is wrapping your handler

#### Issue: Trace ID is all zeros

- **Symptom**: `traceId: '00000000000000000000000000000000'`
- **Fix**: Check compatibility flags and ensure the library is properly initialized

#### Issue: No data in Honeycomb

- **Symptom**: Logs show spans but nothing in Honeycomb
- **Fix**:
  - Verify API key is correct
  - Check dataset name matches exactly
  - Look for errors in worker logs about failed exports
  - Check Honeycomb for rate limiting

#### Issue: Library not found

- **Symptom**: Import errors
- **Fix**: Run `npm install` in the gateway-worker directory

## Testing Steps

1. **Deploy the worker:**

   ```bash
   cd ecomm-ms/gateway-worker
   npm run deploy
   ```

2. **Make a test request:**

   ```bash
   curl https://your-gateway-worker.workers.dev/health
   ```

3. **Check worker logs:**

   ```bash
   wrangler tail
   ```

   Look for:
   - `[GATEWAY] Span Context:` - Should show valid trace ID
   - Any error messages
   - OpenTelemetry config logs

4. **Check Honeycomb:**
   - Wait 30-60 seconds for traces to appear
   - Go to Honeycomb UI
   - Query for `service.name:ecomm-ms-gateway` or your SERVICE_NAME
   - Check the dataset matches `HONEYCOMB_DATASET`

## Debug Mode

To enable more verbose logging, you can temporarily add this to your handler:

```javascript
// At the top of handler.fetch
console.log('[GATEWAY] Environment check:', {
	hasApiKey: !!env.HONEYCOMB_API_KEY,
	dataset: env.HONEYCOMB_DATASET,
	exporterUrl: env.OTEL_EXPORTER_URL,
	serviceName: env.SERVICE_NAME,
});
```

## Still Not Working?

1. Check the `@microlabs/otel-cf-workers` GitHub issues
2. Verify your package version: `npm list @microlabs/otel-cf-workers`
3. Try the manual implementation (the original gateway code that sends directly to Honeycomb batch API)
4. Check Honeycomb support documentation
