/**
 * Root hooks for Mocha - runs for all test files
 */
import { afterEach } from 'mocha';
import sinon from 'sinon';

// Clean up after each test
afterEach(() => {
	sinon.restore();
});
