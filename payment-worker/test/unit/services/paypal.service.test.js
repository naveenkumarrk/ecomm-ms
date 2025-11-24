/**
 * Unit tests for paypal.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { getPaypalAccessToken, createPaypalOrder, capturePaypalOrder } from '../../../src/services/paypal.service.js';
import sinon from 'sinon';

describe('paypal.service', () => {
	let env;
	let paypalServiceModule;

	beforeEach(async () => {
		env = {
			PAYPAL_CLIENT_ID: 'test_client_id',
			PAYPAL_SECRET: 'test_secret',
			PAYPAL_API: 'https://api.sandbox.paypal.com',
		};

		global.fetch = sinon.stub();

		// Clear the token cache by importing fresh module
		// The cache is module-level, so we need to invalidate it
		// by making the token expire immediately
		paypalServiceModule = await import('../../../src/services/paypal.service.js');
		// Force cache to be invalid by manipulating the internal cache
		// Since we can't access it directly, we'll use a token that expires immediately
	});

	afterEach(() => {
		sinon.restore();
		// Clear fetch stub
		global.fetch = undefined;
	});

	describe('getPaypalAccessToken', () => {
		it('should fetch access token from PayPal', async () => {
			// Use unique credentials to avoid cache conflicts
			const testEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_fetch_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_fetch_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			const mockResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token_fetch',
					expires_in: 1, // Short expiry to avoid cache reuse in other tests
				}),
			};

			global.fetch = sinon.stub().resolves(mockResponse);

			const token = await getPaypalAccessToken(testEnv);

			expect(token).to.equal('test_token_fetch');
			expect(global.fetch).to.have.been.calledOnce;
			expect(global.fetch.firstCall.args[0]).to.include('/v1/oauth2/token');
		});

		it('should cache token', async () => {
			// Use unique credentials to avoid cache conflicts with other tests
			const testEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_cache_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_cache_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			const mockResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token_cache',
					expires_in: 10, // Use shorter expiry to avoid interfering with later tests
				}),
			};

			global.fetch = sinon.stub().resolves(mockResponse);

			const token1 = await getPaypalAccessToken(testEnv);
			const token2 = await getPaypalAccessToken(testEnv);

			expect(token1).to.equal(token2);
			expect(token1).to.equal('test_token_cache');
			expect(global.fetch).to.have.been.calledOnce; // Should only fetch once
		});

		it('should throw error when token fetch fails', async () => {
			// Use unique credentials - cache doesn't check credentials, so we need to ensure
			// the previous test's token has expired (expiresAt > now + 5000 check)
			// Wait 6 seconds to ensure cache from previous test expires
			await new Promise((resolve) => setTimeout(resolve, 6000));

			const errorEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_error_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_error_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			const mockResponse = {
				ok: false,
				status: 401,
				text: sinon.stub().resolves('Unauthorized'),
			};

			global.fetch = sinon.stub().resolves(mockResponse);

			let caughtError = null;
			try {
				await getPaypalAccessToken(errorEnv);
			} catch (error) {
				caughtError = error;
			}

			// Verify fetch was called (not using cache)
			expect(global.fetch).to.have.been.called;
			expect(caughtError).to.not.be.null;
			expect(caughtError).to.be.instanceOf(Error);
			expect(caughtError.message).to.include('paypal_token_error');
		});
	});

	describe('createPaypalOrder', () => {
		it('should create PayPal order', async () => {
			// Use unique credentials to avoid cached token
			const orderEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_order_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_order_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			global.fetch = sinon.stub().callsFake(async (url) => {
				if (url.includes('/v1/oauth2/token')) {
					return {
						ok: true,
						json: sinon.stub().resolves({
							access_token: 'test_token_order',
							expires_in: 3600,
						}),
					};
				} else if (url.includes('/v2/checkout/orders')) {
					return {
						ok: true,
						json: sinon.stub().resolves({
							id: 'paypal_order_123',
							links: [{ rel: 'approve', href: 'https://paypal.com/approve' }],
						}),
					};
				}
			});

			const result = await createPaypalOrder(orderEnv, 'res_123', 99.99, 'USD', 'https://return.com');

			expect(result).to.have.property('orderID', 'paypal_order_123');
			expect(result).to.have.property('approveUrl', 'https://paypal.com/approve');
			expect(result).to.have.property('raw');
		});

		it('should throw error when order creation fails', async () => {
			// Use unique credentials to avoid cached token
			const errorEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_error_order_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_error_order_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			global.fetch = sinon.stub().callsFake(async (url) => {
				if (url.includes('/v1/oauth2/token')) {
					return {
						ok: true,
						json: sinon.stub().resolves({
							access_token: 'test_token_error',
							expires_in: 3600,
						}),
					};
				} else if (url.includes('/v2/checkout/orders')) {
					return {
						ok: false,
						status: 400,
						json: sinon.stub().resolves({ error: 'Invalid request' }),
					};
				}
			});

			let caughtError;
			try {
				await createPaypalOrder(errorEnv, 'res_123', 99.99, 'USD');
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			// The code throws an object, not an Error
			expect(caughtError).to.be.an('object');
			expect(caughtError).to.have.property('error', 'paypal_create_failed');
			expect(caughtError).to.have.property('details');
			expect(caughtError).to.have.property('status', 400);
		});
	});

	describe('capturePaypalOrder', () => {
		it('should capture PayPal order', async () => {
			// Use unique credentials to avoid cached token
			const captureEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_capture_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_capture_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			let callCount = 0;
			global.fetch = sinon.stub().callsFake(async (url) => {
				callCount++;
				if (url.includes('/v1/oauth2/token')) {
					return {
						ok: true,
						json: sinon.stub().resolves({
							access_token: 'test_token_capture_' + Math.random(),
							expires_in: 1, // Short expiry to avoid cache reuse
						}),
					};
				} else if (url.includes('/capture')) {
					return {
						ok: true,
						json: sinon.stub().resolves({
							purchase_units: [
								{
									payments: {
										captures: [
											{
												id: 'capture_123',
												status: 'COMPLETED',
											},
										],
									},
								},
							],
						}),
					};
				}
			});

			const result = await capturePaypalOrder(captureEnv, 'paypal_order_123');

			expect(result).to.have.property('captureId', 'capture_123');
			expect(result).to.have.property('raw');
			// Token fetch might be cached, so we check that capture was called
			expect(global.fetch).to.have.been.called;
			const captureCall = global.fetch.getCalls().find((call) => call.args[0].includes('/capture'));
			expect(captureCall).to.exist;
		});

		it('should throw error when capture fails', async () => {
			// Use unique credentials to avoid cached token
			const errorEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_error_capture_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_error_capture_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			global.fetch = sinon.stub().callsFake(async (url) => {
				if (url.includes('/v1/oauth2/token')) {
					return {
						ok: true,
						json: sinon.stub().resolves({
							access_token: 'test_token_error_capture',
							expires_in: 3600,
						}),
					};
				} else if (url.includes('/capture')) {
					return {
						ok: false,
						status: 400,
						json: sinon.stub().resolves({ error: 'Capture failed' }),
					};
				}
			});

			let caughtError;
			try {
				await capturePaypalOrder(errorEnv, 'paypal_order_123');
				expect.fail('Should have thrown an error');
			} catch (err) {
				caughtError = err;
			}

			// The code throws an object, not an Error
			expect(caughtError).to.be.an('object');
			expect(caughtError).to.have.property('error', 'capture_failed');
			expect(caughtError).to.have.property('details');
			expect(caughtError).to.have.property('status', 400);
		});

		it('should throw error when capture not found in response', async () => {
			// Use unique credentials to avoid cached token
			const notCapturedEnv = {
				PAYPAL_CLIENT_ID: 'test_client_id_not_captured_' + Math.random(),
				PAYPAL_SECRET: 'test_secret_not_captured_' + Math.random(),
				PAYPAL_API: 'https://api.sandbox.paypal.com',
			};

			const tokenResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token_not_captured',
					expires_in: 3600,
				}),
			};

			const captureResponse = {
				ok: true,
				json: sinon.stub().resolves({
					purchase_units: [
						{
							payments: {
								captures: [
									{
										id: 'capture_123',
										status: 'FAILED',
									},
								],
							},
						},
					],
				}),
			};

			global.fetch = sinon.stub();
			global.fetch.onFirstCall().resolves(tokenResponse);
			global.fetch.onSecondCall().resolves(captureResponse);

			try {
				await capturePaypalOrder(notCapturedEnv, 'paypal_order_123');
				expect.fail('Should have thrown an error');
			} catch (err) {
				// The code throws an object, not an Error
				expect(err).to.be.an('object');
				expect(err).to.have.property('error', 'not_captured');
				expect(err).to.have.property('details');
			}
		});
	});
});
