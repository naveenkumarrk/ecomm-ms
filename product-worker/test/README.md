# Product Worker Tests

## Test Structure

```
test/
├── unit/              # Unit tests (isolated, fast)
│   ├── db/
│   ├── handlers/
│   ├── services/
│   └── validators/
└── integration/       # Integration tests (with dependencies)
```

## Running Tests

```bash
# Run all unit tests
npm run test:unit

# Run all integration tests
npm run test:integration

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Generate HTML coverage report
npm run test:coverage:html
```

## Test Guidelines

1. **Unit Tests**: Test individual functions/services in isolation using mocks/stubs
2. **Integration Tests**: Test full request/response cycles with real dependencies
3. **Coverage**: Aim for >80% code coverage
4. **Naming**: Use descriptive test names that explain what is being tested
5. **Structure**: Follow the `describe` -> `it` pattern for organization

## Example Test Structure

```javascript
describe('serviceName', () => {
	describe('functionName', () => {
		it('should do something specific', () => {
			// Arrange
			// Act
			// Assert
		});
	});
});
```
