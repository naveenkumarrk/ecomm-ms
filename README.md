# eCommerce Microservices Monorepo

Monorepo containing all microservices for the eCommerce platform built on Cloudflare Workers.

## Services

- **auth-worker**: Authentication and user management
- **cart-worker**: Shopping cart operations
- **fulfillment-worker**: Order fulfillment
- **gateway-worker**: API Gateway
- **inventory-worker**: Inventory management
- **order-worker**: Order processing
- **payment-worker**: Payment processing
- **product-worker**: Product catalog management

## Development

### Prerequisites

- Node.js 20+
- npm
- Cloudflare account with Workers access

### Setup

```bash
# Install root dependencies
npm install

# Install dependencies for all services
npm install --workspaces
```

### Running Services Locally

```bash
# Navigate to a service directory
cd product-worker

# Start development server
npm run dev
```

### Testing

```bash
# Run all tests
npm run test:all

# Run tests for a specific service
cd product-worker
npm run test:unit
npm run test:integration

# Check coverage
npm run test:coverage
```

### Code Quality

```bash
# Format code
npm run format

# Check formatting
npm run format:check

# Check for unused dependencies
npm run knip
```

## CI/CD

### Pull Request Workflow

When opening a PR to `develop`:

1. **Lint**: Prettier formatting check
2. **Knip**: Dependency and unused code check
3. **Unit Tests**: Run unit tests for changed services
4. **Coverage**: Verify 80%+ code coverage
5. **Auto-merge**: If all checks pass, PR is auto-merged

### Staging Deployment (develop branch)

When code is merged to `develop`:

1. **Deploy**: Deploy changed services to staging
2. **Integration Tests**: Run integration tests
3. **Auto-merge to main**: If successful, merge to `main`
4. **Rollback**: If deployment fails, automatically rollback
5. **Slack Notification**: Send success/failure notifications

### Production Deployment (main branch)

When code is merged to `main`:

1. **Deploy**: Deploy changed services to production
2. **Integration Tests**: Run integration tests
3. **Rollback**: If deployment fails, automatically rollback
4. **Slack Notification**: Send success/failure notifications

## GitHub Secrets Required

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID
- `SLACK_WEBHOOK_URL`: Slack webhook URL for notifications
- `GITHUB_TOKEN`: Auto-generated GitHub token (for auto-merge)

## Environments

- **Staging**: Deployed from `develop` branch
- **Production**: Deployed from `main` branch

## Coverage Requirements

All services must maintain **80%+ code coverage** for PRs to be merged.

## Contributing

1. Create a feature branch from `develop`
2. Make your changes
3. Ensure all tests pass and coverage is 80%+
4. Create a PR to `develop`
5. CI will automatically check and merge if successful
