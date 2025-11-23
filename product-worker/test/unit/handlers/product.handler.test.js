/**
 * Unit tests for product.handler.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as productHandler from '../../../src/handlers/product.handler.js';
import sinon from 'sinon';

describe('product.handler', () => {
	let env, request;
	let fetchStub;

	beforeEach(() => {
		const stmt = {
			bind: sinon.stub().returnsThis(),
			all: sinon.stub(),
			first: sinon.stub(),
			run: sinon.stub(),
		};

		env = {
			DB: {
				prepare: sinon.stub().returns(stmt),
			},
			INVENTORY_SERVICE_URL: 'https://inventory.example.com',
			INTERNAL_SECRET: 'test-secret',
		};

		request = {
			url: 'https://example.com/products?limit=10&offset=0',
			headers: {
				get: sinon.stub(),
			},
		};

		// Mock fetch for inventory service calls
		fetchStub = sinon.stub(global, 'fetch');
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('getProductsHandler', () => {
		it('should return products list', async () => {
			const mockProducts = {
				results: [
					{
						product_id: 'pro_1',
						title: 'Product 1',
						sku: 'SKU-001',
						description: 'Desc 1',
						category: 'Cat 1',
						images: '[]',
						metadata: '{"price": 100}',
						created_at: 1234567890,
						updated_at: 1234567890,
					},
				],
			};

			// Mock DB query
			const stmt = env.DB.prepare();
			stmt.all.resolves(mockProducts);

			// Mock inventory service response
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"stock": 50, "reserved": 5}'),
			});

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.be.an('array');
			expect(data[0]).to.have.property('productId', 'pro_1');
			expect(data[0]).to.have.property('stock', 50);
			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM products LIMIT ? OFFSET ?');
		});

		it('should handle database errors', async () => {
			// Mock DB query to throw error
			const stmt = env.DB.prepare();
			stmt.all.rejects(new Error('DB Error'));

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Database query failed');
		});

		it('should use default limit and offset', async () => {
			request.url = 'https://example.com/products';

			const stmt = env.DB.prepare();
			stmt.all.resolves({ results: [] });

			await productHandler.getProductsHandler(request, env);

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM products LIMIT ? OFFSET ?');
			expect(stmt.bind).to.have.been.calledWith(20, 0);
		});

		it('should return empty array when no results', async () => {
			const stmt = env.DB.prepare();
			stmt.all.resolves({ results: [] });

			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"stock": 0, "reserved": 0}'),
			});

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.be.an('array').that.is.empty;
		});

		it('should handle missing DB binding', async () => {
			delete env.DB;

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Database not available');
		});

		it('should validate query parameters', async () => {
			request.url = 'https://example.com/products?limit=-1&offset=0';

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(400);
			expect(data).to.have.property('error', 'validation_error');
		});
	});

	describe('getProductByIdHandler', () => {
		beforeEach(() => {
			request.params = { id: 'pro_123' };
		});

		it('should return product by ID', async () => {
			const mockProduct = {
				product_id: 'pro_123',
				title: 'Test Product',
				sku: 'SKU-001',
				description: 'Test',
				category: 'Test',
				images: '[]',
				metadata: '{"price": 100}',
				created_at: 1234567890,
				updated_at: 1234567890,
			};

			// Mock DB query
			const stmt = env.DB.prepare();
			stmt.first.resolves(mockProduct);

			// Mock inventory service response
			fetchStub.resolves({
				ok: true,
				status: 200,
				text: sinon.stub().resolves('{"stock": 50, "reserved": 5}'),
			});

			const response = await productHandler.getProductByIdHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('productId', 'pro_123');
			expect(data).to.have.property('stock', 50);
			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM products WHERE product_id = ?');
			expect(stmt.bind).to.have.been.calledWith('pro_123');
		});

		it('should return 404 if product not found', async () => {
			const stmt = env.DB.prepare();
			stmt.first.resolves(null);

			const response = await productHandler.getProductByIdHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(404);
			expect(data).to.have.property('error', 'Product not found');
		});

		it('should handle database errors', async () => {
			const stmt = env.DB.prepare();
			stmt.first.rejects(new Error('DB Error'));

			const response = await productHandler.getProductByIdHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Internal server error');
		});
	});

	describe('uploadImageHandler', () => {
		beforeEach(() => {
			env.PRODUCT_IMAGES = { put: sinon.stub() };
			env.R2_PUBLIC_URL = 'https://cdn.example.com';
			env.ADMIN_SECRET = 'admin-secret';
			request.url = 'https://example.com/products/images/upload';
			request.method = 'POST';
		});

		it('should return 401 without admin auth', async () => {
			request.headers.get.withArgs('x-timestamp').returns(null);
			request.headers.get.withArgs('x-signature').returns(null);

			const response = await productHandler.uploadImageHandler(request, env);
			const text = await response.text();

			expect(response.status).to.equal(401);
			expect(text).to.equal('unauthorized');
		});

		it('should return 500 if R2 not configured', async () => {
			delete env.PRODUCT_IMAGES;
			request.url = 'https://example.com/products/images/upload';
			const ts = Date.now().toString();
			const msg = `${ts}|POST|/products/images/upload|`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('application/json');
			request.clone = sinon.stub().returns(request);
			request.text = sinon.stub().resolves('');

			const response = await productHandler.uploadImageHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'R2 bucket not configured');
		});
	});

	describe('createProductHandler', () => {
		beforeEach(async () => {
			env.ADMIN_SECRET = 'admin-secret';
			env.PRODUCT_IMAGES = { put: sinon.stub() };
			env.R2_PUBLIC_URL = 'https://cdn.example.com';
			request.url = 'https://example.com/products';
			request.method = 'POST';
			const ts = Date.now().toString();
			const body = '{}';
			const msg = `${ts}|POST|/products|${body}`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('application/json');
			request.clone = sinon.stub().returns(request);
			request.text = sinon.stub().resolves(body);
		});

		it('should create product with JSON body', async () => {
			const productData = {
				title: 'Test Product',
				description: 'Test Description',
				category: 'Electronics',
				metadata: { price: 100 },
			};

			request.json = sinon.stub().resolves(productData);

			const stmt = env.DB.prepare();
			stmt.run.resolves({ success: true });

			const response = await productHandler.createProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(201);
			expect(data).to.have.property('productId');
			expect(data).to.have.property('images');
		});

		it('should return 400 for validation errors', async () => {
			request.json = sinon.stub().resolves({ title: '' }); // Invalid: title too short

			const response = await productHandler.createProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(400);
			expect(data).to.have.property('error', 'validation_error');
		});
	});

	describe('updateProductHandler', () => {
		beforeEach(async () => {
			request.params = { id: 'pro_123' };
			env.ADMIN_SECRET = 'admin-secret';
			env.PRODUCT_IMAGES = { put: sinon.stub() };
			env.R2_PUBLIC_URL = 'https://cdn.example.com';
			const ts = Date.now().toString();
			const body = '{}';
			const msg = `${ts}|PUT|/products/pro_123|${body}`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.url = 'https://example.com/products/pro_123';
			request.method = 'PUT';
			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('application/json');
			request.clone = sinon.stub().returns(request);
			request.text = sinon.stub().resolves(body);

			// Mock existing product
			const stmt = env.DB.prepare();
			stmt.first.resolves({
				product_id: 'pro_123',
				title: 'Existing Product',
			});
		});

		it('should return 404 if product not found', async () => {
			const stmt = env.DB.prepare();
			stmt.first.resolves(null);

			request.json = sinon.stub().resolves({ title: 'New Title' });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(404);
			expect(data).to.have.property('error', 'Product not found');
		});

		it('should update product with JSON body', async () => {
			request.json = sinon.stub().resolves({ title: 'Updated Title' });

			const stmt = env.DB.prepare();
			stmt.first.onSecondCall().resolves({ product_id: 'pro_123' });
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('productId', 'pro_123');
			expect(data).to.have.property('updated', true);
		});

		it('should return 400 if no fields to update', async () => {
			request.json = sinon.stub().resolves({});

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(400);
			expect(data).to.have.property('error', 'No fields to update');
		});
	});
});
