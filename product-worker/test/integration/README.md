# Integration Tests

Integration tests verify the full request/response cycle through the worker, including:
- Route handling
- Middleware execution
- Service interactions
- Database operations
- External service calls

## Running Integration Tests

```bash
npm run test:integration
```

## Test Structure

Integration tests use real request/response objects and test the complete flow:
- HTTP request creation
- Worker handler execution
- Response validation
- Status code verification
- Data structure validation

## Mocking Strategy

- **Database**: Mocked using sinon stubs
- **External Services**: Mocked using sinon stubs or global.fetch
- **KV Storage**: Mocked using sinon stubs
- **Service Bindings**: Mocked using sinon stubs

## Example Test Flow

1. Setup environment with mocked dependencies
2. Create HTTP request
3. Call worker handler
4. Verify response status and data
5. Verify service interactions

