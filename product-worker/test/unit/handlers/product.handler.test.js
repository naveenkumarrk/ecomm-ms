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

		it('should return empty array when rows is null', async () => {
			const stmt = env.DB.prepare();
			stmt.all.resolves(null);

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.be.an('array').that.is.empty;
		});

		it('should return empty array when rows.results is null', async () => {
			const stmt = env.DB.prepare();
			stmt.all.resolves({ results: null });

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.be.an('array').that.is.empty;
		});

		it('should handle errors in getProductsHandler catch block', async () => {
			request.url = 'invalid-url';

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Internal server error');
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

		it('should return 500 if R2_PUBLIC_URL not configured', async () => {
			delete env.R2_PUBLIC_URL;
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
			expect(data).to.have.property('error', 'R2 public URL not configured');
		});

		it('should handle upload errors', async () => {
			request.url = 'https://example.com/products/images/upload';
			const ts = Date.now().toString();
			const msg = `${ts}|POST|/products/images/upload|`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('multipart/form-data');
			request.formData = sinon.stub().rejects(new Error('Upload failed'));

			const response = await productHandler.uploadImageHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Upload failed');
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

		it('should create product with single image string', async () => {
			request.json = sinon.stub().resolves({
				title: 'Test Product',
				description: 'Test',
				images: 'https://example.com/image.jpg',
			});

			const stmt = env.DB.prepare();
			stmt.run.resolves({ success: true });

			const response = await productHandler.createProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(201);
			expect(data).to.have.property('productId');
		});

		it('should handle errors during product creation', async () => {
			request.json = sinon.stub().resolves({
				title: 'Test Product',
				description: 'Test',
			});

			const stmt = env.DB.prepare();
			stmt.run.rejects(new Error('Database error'));

			const response = await productHandler.createProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Creation failed');
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
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
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

		it('should handle single image string in updateData.images', async () => {
			request.json = sinon.stub().resolves({ images: 'https://example.com/image.jpg' });

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should handle validation errors in update', async () => {
			request.json = sinon.stub().resolves({ title: '' }); // Invalid: title too short

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(400);
			expect(data).to.have.property('error', 'validation_error');
		});

		it('should update sku field', async () => {
			request.json = sinon.stub().resolves({ sku: 'NEW-SKU-123' });

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should update description field', async () => {
			request.json = sinon.stub().resolves({ description: 'New description' });

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should update category field', async () => {
			request.json = sinon.stub().resolves({ category: 'New Category' });

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should update images when imageUrls provided', async () => {
			request.json = sinon.stub().resolves({ images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'] });

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should update metadata field', async () => {
			request.json = sinon.stub().resolves({ metadata: { price: 200, weight: 1.5 } });

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should handle errors during update', async () => {
			request.json = sinon.stub().resolves({ title: 'Updated Title' });

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.rejects(new Error('Database error'));

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Update failed');
		});

		it('should upload image files and update product', async () => {
			// Setup admin auth
			const ts = Date.now().toString();
			const body = '';
			const msg = `${ts}|PUT|/products/pro_123|${body}`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('multipart/form-data');

			const formData = new FormData();
			formData.append('title', 'Updated Title');
			const imageFile = new File([new Uint8Array(100)], 'test.jpg', { type: 'image/jpeg' });
			formData.append('images', imageFile);

			request.formData = sinon.stub().resolves(formData);

			env.PRODUCT_IMAGES.put.resolves();

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
			expect(env.PRODUCT_IMAGES.put).to.have.been.calledOnce;
		});

		it('should update product with multipart form data using product field', async () => {
			const ts = Date.now().toString();
			const body = '';
			const msg = `${ts}|PUT|/products/pro_123|${body}`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('multipart/form-data');

			const formData = new FormData();
			formData.append('product', JSON.stringify({ title: 'Updated Title', description: 'Updated' }));

			request.formData = sinon.stub().resolves(formData);

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should update product with multipart form data using individual fields', async () => {
			const ts = Date.now().toString();
			const body = '';
			const msg = `${ts}|PUT|/products/pro_123|${body}`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('multipart/form-data');

			const formData = new FormData();
			formData.append('sku', 'NEW-SKU');
			formData.append('title', 'Updated Title');
			formData.append('description', 'Updated Description');
			formData.append('category', 'New Category');
			formData.append('metadata', JSON.stringify({ price: 200 }));

			request.formData = sinon.stub().resolves(formData);

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});

		it('should update product with imageUrls in multipart', async () => {
			const ts = Date.now().toString();
			const body = '';
			const msg = `${ts}|PUT|/products/pro_123|${body}`;
			const enc = new TextEncoder();
			const key = await crypto.subtle.importKey('raw', enc.encode('admin-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
			const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
			const signature = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');

			request.headers.get.withArgs('x-timestamp').returns(ts);
			request.headers.get.withArgs('x-signature').returns(signature);
			request.headers.get.withArgs('content-type').returns('multipart/form-data');

			const formData = new FormData();
			formData.append('title', 'Updated Title');
			formData.append('imageUrls', JSON.stringify(['https://example.com/img1.jpg']));

			request.formData = sinon.stub().resolves(formData);

			const stmt = env.DB.prepare();
			stmt.first.resolves({ product_id: 'pro_123' }); // First call for getProductById
			stmt.run.resolves({ success: true });

			const response = await productHandler.updateProductHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('updated', true);
		});
	});
});
