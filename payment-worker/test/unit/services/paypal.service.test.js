/**
 * Unit tests for paypal.service.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import { getPaypalAccessToken, createPaypalOrder, capturePaypalOrder } from '../../../src/services/paypal.service.js';
import sinon from 'sinon';

describe('paypal.service', () => {
	let env;

	beforeEach(() => {
		env = {
			PAYPAL_CLIENT_ID: 'test_client_id',
			PAYPAL_SECRET: 'test_secret',
			PAYPAL_API: 'https://api.sandbox.paypal.com',
		};

		global.fetch = sinon.stub();
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('getPaypalAccessToken', () => {
		it('should fetch access token from PayPal', async () => {
			const mockResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token_123',
					expires_in: 3600,
				}),
			};

			global.fetch.resolves(mockResponse);

			const token = await getPaypalAccessToken(env);

			expect(token).to.equal('test_token_123');
			expect(global.fetch).to.have.been.calledOnce;
			expect(global.fetch.firstCall.args[0]).to.include('/v1/oauth2/token');
		});

		it('should cache token', async () => {
			const mockResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token_123',
					expires_in: 3600,
				}),
			};

			global.fetch.resolves(mockResponse);

			const token1 = await getPaypalAccessToken(env);
			const token2 = await getPaypalAccessToken(env);

			expect(token1).to.equal(token2);
			expect(global.fetch).to.have.been.calledOnce; // Should only fetch once
		});

		it('should throw error when token fetch fails', async () => {
			const mockResponse = {
				ok: false,
				status: 401,
				text: sinon.stub().resolves('Unauthorized'),
			};

			global.fetch.resolves(mockResponse);

			try {
				await getPaypalAccessToken(env);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('paypal_token_error');
			}
		});
	});

	describe('createPaypalOrder', () => {
		it('should create PayPal order', async () => {
			const tokenResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token',
					expires_in: 3600,
				}),
			};

			const orderResponse = {
				ok: true,
				json: sinon.stub().resolves({
					id: 'paypal_order_123',
					links: [{ rel: 'approve', href: 'https://paypal.com/approve' }],
				}),
			};

			global.fetch.onFirstCall().resolves(tokenResponse);
			global.fetch.onSecondCall().resolves(orderResponse);

			const result = await createPaypalOrder(env, 'res_123', 99.99, 'USD', 'https://return.com');

			expect(result).to.have.property('orderID', 'paypal_order_123');
			expect(result).to.have.property('approveUrl');
		});

		it('should throw error when order creation fails', async () => {
			const tokenResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token',
					expires_in: 3600,
				}),
			};

			const orderResponse = {
				ok: false,
				status: 400,
				json: sinon.stub().resolves({ error: 'Invalid request' }),
			};

			global.fetch.onFirstCall().resolves(tokenResponse);
			global.fetch.onSecondCall().resolves(orderResponse);

			try {
				await createPaypalOrder(env, 'res_123', 99.99, 'USD');
				expect.fail('Should have thrown an error');
			} catch (err) {
				expect(err.error).to.equal('paypal_create_failed');
			}
		});
	});

	describe('capturePaypalOrder', () => {
		it('should capture PayPal order', async () => {
			const tokenResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token',
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
										status: 'COMPLETED',
									},
								],
							},
						},
					],
				}),
			};

			global.fetch.onFirstCall().resolves(tokenResponse);
			global.fetch.onSecondCall().resolves(captureResponse);

			const result = await capturePaypalOrder(env, 'paypal_order_123');

			expect(result).to.have.property('captureId', 'capture_123');
		});

		it('should throw error when capture fails', async () => {
			const tokenResponse = {
				ok: true,
				json: sinon.stub().resolves({
					access_token: 'test_token',
					expires_in: 3600,
				}),
			};

			const captureResponse = {
				ok: false,
				status: 400,
				json: sinon.stub().resolves({ error: 'Capture failed' }),
			};

			global.fetch.onFirstCall().resolves(tokenResponse);
			global.fetch.onSecondCall().resolves(captureResponse);

			try {
				await capturePaypalOrder(env, 'paypal_order_123');
				expect.fail('Should have thrown an error');
			} catch (err) {
				expect(err.error).to.equal('capture_failed');
			}
		});
	});
});
