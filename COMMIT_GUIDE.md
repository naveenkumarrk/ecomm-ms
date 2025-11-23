# Git Workflow Guide

## Current Status
You're on the `develop` branch with CI/CD setup ready to commit.

## Recommended Steps

### Step 1: Commit CI/CD Infrastructure (First)
```bash
# Stage CI/CD files
git add .github/ knip.json package.json .gitignore README.md SETUP.md

# Commit
git commit -m "ci: add comprehensive CI/CD pipeline

- Add GitHub Actions workflows for CI/CD
- Configure knip for dependency checking
- Add coverage enforcement (90%+)
- Add Slack notifications
- Add auto-merge functionality
- Add rollback mechanisms
- Add service change detection"
```

### Step 2: Commit Test Improvements (Separate)
```bash
# Stage test files
git add auth-worker/test/ inventory-worker/test/ product-worker/test/ \
        gateway-worker/test/ payment-worker/test/ \
        cart-worker/test/ fulfillment-worker/test/ order-worker/test/

# Commit
git commit -m "test: improve test coverage and fix failing tests

- Fix ES module stubbing issues
- Add missing test files for helpers and middleware
- Improve coverage across all services
- Fix failing tests in auth, gateway, inventory workers"
```

### Step 3: Commit Service Code Changes (If any)
```bash
# Review and commit service code changes separately
git add cart-worker/src/ payment-worker/src/
git commit -m "fix: update service handlers"
```

### Step 4: Push to Develop
```bash
git push origin develop
```

### Step 5: Test CI/CD Pipeline
1. Create a test PR to `develop` (or push directly)
2. Watch the CI checks run
3. Verify all checks pass
4. Check Slack notifications

### Step 6: Merge to Main (After Testing)
Once CI/CD is verified on `develop`:
```bash
git checkout main
git merge develop
git push origin main
```

## Alternative: Single Commit (Quick Start)
If you want to push everything at once:
```bash
git add .
git commit -m "ci: add CI/CD pipeline and improve test coverage"
git push origin develop
```

## Important Notes

⚠️ **Before pushing to main:**
- Test the CI/CD pipeline on `develop` first
- Verify GitHub secrets are configured
- Ensure Cloudflare credentials are set
- Test Slack notifications

✅ **Safe to push to develop:**
- CI/CD infrastructure
- Test improvements
- Service code changes

🚀 **After develop is tested:**
- Merge to main via PR or direct merge
- Production deployment will trigger automatically

