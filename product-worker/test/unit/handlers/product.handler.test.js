/**
 * Unit tests for product.handler.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as productHandler from '../../../src/handlers/product.handler.js';
import * as productService from '../../../src/services/product.service.js';
import * as dbQueries from '../../../src/db/queries.js';
import sinon from 'sinon';

describe('product.handler', () => {
	let env, request;

	beforeEach(() => {
		env = {
			DB: {
				prepare: sinon.stub().returns({
					bind: sinon.stub().returnsThis(),
					all: sinon.stub(),
					first: sinon.stub(),
					run: sinon.stub(),
				}),
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

			const getProductsStub = sinon.stub(dbQueries, 'getProducts').resolves(mockProducts);
			const enrichStub = sinon.stub(productService, 'enrichProductsWithStock').resolves([
				{
					productId: 'pro_1',
					title: 'Product 1',
					stock: 50,
					reserved: 5,
				},
			]);

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.be.an('array');
			expect(data[0]).to.have.property('productId', 'pro_1');
			expect(getProductsStub).to.have.been.calledOnce;
			expect(enrichStub).to.have.been.calledOnce;
		});

		it('should handle database errors', async () => {
			const getProductsStub = sinon.stub(dbQueries, 'getProducts').rejects(new Error('DB Error'));

			const response = await productHandler.getProductsHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(500);
			expect(data).to.have.property('error', 'Internal server error');
		});

		it('should use default limit and offset', async () => {
			request.url = 'https://example.com/products';

			const getProductsStub = sinon.stub(dbQueries, 'getProducts').resolves({ results: [] });
			const enrichStub = sinon.stub(productService, 'enrichProductsWithStock').resolves([]);

			await productHandler.getProductsHandler(request, env);

			expect(getProductsStub).to.have.been.calledWith(env, 20, 0);
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

			const getProductStub = sinon.stub(dbQueries, 'getProductById').resolves(mockProduct);
			const enrichStub = sinon.stub(productService, 'enrichProductWithStock').resolves({
				productId: 'pro_123',
				title: 'Test Product',
				stock: 50,
				reserved: 5,
			});

			const response = await productHandler.getProductByIdHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(200);
			expect(data).to.have.property('productId', 'pro_123');
			expect(getProductStub).to.have.been.calledWith(env, 'pro_123');
		});

		it('should return 404 if product not found', async () => {
			const getProductStub = sinon.stub(dbQueries, 'getProductById').resolves(null);

			const response = await productHandler.getProductByIdHandler(request, env);
			const data = await response.json();

			expect(response.status).to.equal(404);
			expect(data).to.have.property('error', 'Product not found');
		});
	});
});
