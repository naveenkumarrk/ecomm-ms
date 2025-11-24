# GitHub Secrets Configuration Guide

This document lists all the secrets you need to configure in your GitHub repository for the CI/CD workflows to function properly.

## How to Add Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret listed below

---

## Required Secrets

### 🔐 **CLOUDFLARE_API_TOKEN** (Required)
- **Purpose**: Cloudflare API token for deploying workers
- **Where to get it**: 
  - Go to Cloudflare Dashboard → My Profile → API Tokens
  - Create a token with `Account.Cloudflare Workers:Edit` permissions
- **Used in**: All deployment workflows (cd-develop, cd-main, deploy-service)

### 🔐 **CLOUDFLARE_ACCOUNT_ID** (Required)
- **Purpose**: Your Cloudflare account ID
- **Where to get it**: 
  - Cloudflare Dashboard → Right sidebar → Account ID
- **Used in**: All deployment workflows (cd-develop, cd-main, deploy-service)

### 🔐 **PAT_TOKEN** (Required)
- **Purpose**: Personal Access Token (PAT) for auto-merging PRs and pushing to main branch
- **Where to get it**: 
  - GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
  - Create token with scopes: `repo` (full control)
  - **Important**: Use a bot account or service account, not your personal account
- **Used in**: 
  - `ci-feature.yml` (auto-merge PRs to develop)
  - `cd-develop.yml` (auto-merge develop to main)

### 🔐 **SLACK_WEBHOOK_URL** (Optional but Recommended)
- **Purpose**: Slack webhook URL for deployment notifications
- **Where to get it**: 
  - Slack → Apps → Incoming Webhooks → Add to Slack
  - Copy the webhook URL
- **Used in**: 
  - `ci-feature.yml` (CI result notifications)
  - `cd-develop.yml` (rollback notifications)
  - `cd-main.yml` (deployment and rollback notifications)

---

## Staging URL Configuration (Choose ONE option)

You need to configure staging URLs for integration tests. Choose **one** of the following options:

### Option 1: **STAGING_URLS_JSON** (Recommended)
- **Purpose**: JSON mapping of all 8 worker staging URLs
- **Format**: 
```json
{
  "auth-worker": "https://auth-worker-staging.example.com",
  "cart-worker": "https://cart-worker-staging.example.com",
  "fulfillment-worker": "https://fulfillment-worker-staging.example.com",
  "gateway-worker": "https://gateway-worker-staging.example.com",
  "inventory-worker": "https://inventory-worker-staging.example.com",
  "order-worker": "https://order-worker-staging.example.com",
  "payment-worker": "https://payment-worker-staging.example.com",
  "product-worker": "https://product-worker-staging.example.com"
}
```
- **Used in**: `cd-develop.yml` (integration tests)

### Option 2: **STAGING_BASE_DOMAIN** (Alternative)
- **Purpose**: Base domain for constructing staging URLs
- **Example**: `example.com`
- **Result**: URLs will be `https://{service-name}-staging.example.com`
- **Used in**: `cd-develop.yml` (integration tests)

### Option 3: **CLOUDFLARE_ACCOUNT_SUBDOMAIN** (Alternative)
- **Purpose**: Your Cloudflare account subdomain for workers.dev URLs
- **Example**: `your-account` (from `your-account.workers.dev`)
- **Result**: URLs will be `https://{service-name}.your-account.workers.dev`
- **Used in**: `cd-develop.yml` (integration tests)

---

## Summary Checklist

### ✅ Required Secrets
- [ ] `CLOUDFLARE_API_TOKEN`
- [ ] `CLOUDFLARE_ACCOUNT_ID`
- [ ] `PAT_TOKEN`

### ✅ Optional but Recommended
- [ ] `SLACK_WEBHOOK_URL`

### ✅ Staging URL Configuration (Choose ONE)
- [ ] `STAGING_URLS_JSON` (recommended for 8 workers)
- [ ] OR `STAGING_BASE_DOMAIN`
- [ ] OR `CLOUDFLARE_ACCOUNT_SUBDOMAIN`

---

## Quick Setup Example

If you're using Cloudflare Workers with a custom domain pattern, here's a quick example:

1. **STAGING_URLS_JSON**:
```json
{
  "auth-worker": "https://auth-worker-staging.yourdomain.com",
  "cart-worker": "https://cart-worker-staging.yourdomain.com",
  "fulfillment-worker": "https://fulfillment-worker-staging.yourdomain.com",
  "gateway-worker": "https://gateway-worker-staging.yourdomain.com",
  "inventory-worker": "https://inventory-worker-staging.yourdomain.com",
  "order-worker": "https://order-worker-staging.yourdomain.com",
  "payment-worker": "https://payment-worker-staging.yourdomain.com",
  "product-worker": "https://product-worker-staging.yourdomain.com"
}
```

2. Or if using workers.dev pattern, set **CLOUDFLARE_ACCOUNT_SUBDOMAIN** to your account subdomain (e.g., `my-account` for `my-account.workers.dev`)

---

## Security Notes

- ⚠️ Never commit secrets to the repository
- ⚠️ Use environment-specific secrets when possible
- ⚠️ Rotate secrets periodically
- ⚠️ Use a bot/service account for PAT_TOKEN, not personal accounts
- ⚠️ Limit PAT_TOKEN permissions to minimum required

