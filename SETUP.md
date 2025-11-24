# CI/CD Setup Guide

This guide will help you set up the CI/CD pipeline for the eCommerce monorepo.

## Prerequisites

1. GitHub repository with `develop` and `main` branches
2. Cloudflare account with Workers access
3. Slack workspace with webhook URL

## Step 1: Install Root Dependencies

```bash
cd ecomm-ms
npm install
```

This installs:
- `knip` for dependency checking
- `prettier` for code formatting

## Step 2: Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following secrets:

### Required Secrets

1. **CLOUDFLARE_API_TOKEN**
   - Generate at: https://dash.cloudflare.com/profile/api-tokens
   - Permissions needed: Account → Workers Scripts → Edit

2. **CLOUDFLARE_ACCOUNT_ID**
   - Find in Cloudflare Dashboard → Right sidebar

3. **SLACK_WEBHOOK_URL**
   - Create at: https://api.slack.com/messaging/webhooks
   - Incoming Webhook URL

4. **GITHUB_TOKEN** (auto-generated)
   - Automatically available in workflows
   - Used for auto-merge functionality

## Step 3: Configure GitHub Environments

Go to Settings → Environments

### Create Staging Environment

1. Name: `staging`
2. Add protection rules (optional):
   - Required reviewers
   - Wait timer
3. Add secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `STAGING_URL` (optional, for integration tests)

### Create Production Environment

1. Name: `production`
2. Add protection rules (recommended):
   - Required reviewers
   - Wait timer
3. Add secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `PRODUCTION_URL` (optional, for integration tests)

## Step 4: Configure Wrangler

Each service needs a `wrangler.jsonc` file with staging environment:

```jsonc
{
  "name": "service-name",
  "compatibility_date": "2024-01-01",
  "env": {
    "staging": {
      "name": "service-name-staging"
    }
  }
}
```

## Step 5: Test the Pipeline

### Test CI (PR to develop)

1. Create a feature branch:
   ```bash
   git checkout -b feature/test-ci develop
   ```

2. Make a small change (e.g., add a comment)

3. Commit and push:
   ```bash
   git add .
   git commit -m "test: CI pipeline"
   git push origin feature/test-ci
   ```

4. Create a PR to `develop`

5. Verify:
   - ✅ Lint check runs
   - ✅ Knip check runs
   - ✅ Unit tests run
   - ✅ Coverage check (90%+)
   - ✅ PR status shows all checks

### Test Staging Deployment

1. Merge PR to `develop` (or push directly)

2. Verify:
   - ✅ Services deploy to staging
   - ✅ Integration tests run
   - ✅ Slack notification sent
   - ✅ Auto-merge to main (if successful)

### Test Production Deployment

1. Code should auto-merge to `main` after staging success

2. Verify:
   - ✅ Services deploy to production
   - ✅ Integration tests run
   - ✅ Slack notification sent
   - ✅ Rollback works if failure

## Step 6: Configure Branch Protection

Go to Settings → Branches

### Protect `develop` branch

- Require pull request reviews
- Require status checks to pass:
  - `lint`
  - `knip-check`
  - `unit-tests`
  - `coverage-check`
- Require branches to be up to date

### Protect `main` branch

- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date
- Do not allow force pushes

## Troubleshooting

### Coverage Check Fails

- Ensure `coverage/coverage-summary.json` exists
- Check coverage is 90%+ using: `npm run test:coverage`

### Knip Check Fails

- Review unused dependencies
- Update `knip.json` to ignore false positives

### Deployment Fails

- Check Cloudflare API token permissions
- Verify `wrangler.jsonc` configuration
- Check Cloudflare account limits

### Slack Notifications Not Working

- Verify webhook URL is correct
- Check Slack app permissions
- Test webhook manually: `curl -X POST $SLACK_WEBHOOK_URL -d '{"text":"test"}'`

## Workflow Summary

```
PR to develop
  ↓
CI Checks (lint, knip, tests, coverage)
  ↓
Auto-merge if 90%+ coverage
  ↓
Deploy to Staging
  ↓
Integration Tests
  ↓
Auto-merge to main (if success)
  ↓
Deploy to Production
  ↓
Integration Tests
  ↓
Slack Notification
```

## Next Steps

- Add E2E tests (as mentioned in requirements)
- Configure monitoring and alerts
- Set up deployment dashboards
- Add performance testing

