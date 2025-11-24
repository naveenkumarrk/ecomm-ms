# Deployment Workflow Fix

## Issue
The deployment workflow was failing with:
```
Error: Process completed with exit code 1.
Running: npx wrangler deploy --env staging
```

## Root Cause
The `wrangler.jsonc` files were missing the `staging` environment configuration. When the workflow tries to deploy with `--env staging`, wrangler fails because the environment doesn't exist.

## Solution

### 1. Added Staging Environment to Gateway Worker
Updated `gateway-worker/wrangler.jsonc` to include:
```jsonc
"env": {
  "staging": {
    "name": "gateway-worker-staging"
  }
}
```

### 2. Improved Workflow Error Handling
Updated `.github/workflows/deploy-service.yml` to:
- Check if staging environment exists before deploying
- Provide clear error messages if environment is missing
- Show exact configuration needed

### 3. All Services Need Staging Environment

Each service's `wrangler.jsonc` needs to have a `staging` environment section. Add this to all services:

**Pattern:**
```jsonc
{
  "name": "service-name",
  // ... other config ...
  "env": {
    "staging": {
      "name": "service-name-staging"
    }
  }
}
```

**Services that need staging environment:**
- ✅ gateway-worker (already added)
- ⏳ auth-worker
- ⏳ cart-worker
- ⏳ product-worker
- ⏳ inventory-worker
- ⏳ order-worker
- ⏳ payment-worker
- ⏳ fulfillment-worker

## Quick Fix Script

Run this to add staging to all services:

```bash
cd ecomm-ms

# Add staging env to each service
for service in auth-worker cart-worker product-worker inventory-worker order-worker payment-worker fulfillment-worker; do
  if [ -f "$service/wrangler.jsonc" ]; then
    # Check if staging already exists
    if ! grep -q '"staging"' "$service/wrangler.jsonc"; then
      # Add staging env before closing brace
      sed -i.bak 's/}$/  "env": {\n    "staging": {\n      "name": "'"$service"'-staging"\n    }\n  }\n}/' "$service/wrangler.jsonc"
      echo "Added staging env to $service"
    else
      echo "$service already has staging env"
    fi
  fi
done
```

## Manual Fix

For each service, add this before the closing `}`:

```jsonc
"env": {
  "staging": {
    "name": "service-name-staging"
  }
}
```

## Verification

After adding staging environments, verify with:
```bash
cd gateway-worker
npx wrangler deploy --env staging --dry-run
```

## Next Steps

1. Add staging environment to all remaining services
2. Test deployment to staging
3. Verify staging URLs are configured correctly
4. Run integration tests against staging

