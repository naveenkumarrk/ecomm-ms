/**
 * Unit tests for db/queries.js
 */
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as queries from '../../../src/db/queries.js';
import sinon from 'sinon';

describe('db.queries', () => {
	let env;

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
		};
	});

	afterEach(() => {
		sinon.restore();
	});

	describe('getProducts', () => {
		it('should fetch products with limit and offset', async () => {
			const mockProducts = {
				results: [{ product_id: 'pro_1', title: 'Product 1' }],
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				all: sinon.stub().resolves(mockProducts),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.getProducts(env, 10, 0);

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM products LIMIT ? OFFSET ?');
			expect(stmt.bind).to.have.been.calledWith(10, 0);
			expect(stmt.all).to.have.been.calledOnce;
			expect(result).to.have.property('results');
			expect(result.results).to.be.an('array').with.lengthOf(1);
		});
	});

	describe('getProductById', () => {
		it('should fetch a single product by ID', async () => {
			const mockProduct = {
				product_id: 'pro_123',
				title: 'Test Product',
				sku: 'SKU-001',
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				first: sinon.stub().resolves(mockProduct),
			};

			env.DB.prepare.returns(stmt);

			const result = await queries.getProductById(env, 'pro_123');

			expect(env.DB.prepare).to.have.been.calledWith('SELECT * FROM products WHERE product_id = ?');
			expect(stmt.bind).to.have.been.calledWith('pro_123');
			expect(stmt.first).to.have.been.calledOnce;
			expect(result).to.have.property('product_id', 'pro_123');
		});
	});

	describe('createProduct', () => {
		it('should insert a new product', async () => {
			const productData = {
				productId: 'pro_123',
				sku: 'SKU-001',
				title: 'Test Product',
				description: 'Test Description',
				category: 'Electronics',
				images: ['img1.jpg'],
				metadata: { price: 100 },
				now: 1234567890,
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true }),
			};

			env.DB.prepare.returns(stmt);

			await queries.createProduct(env, productData);

			expect(env.DB.prepare).to.have.been.called;
			expect(stmt.bind).to.have.been.calledWith(
				'pro_123',
				'SKU-001',
				'Test Product',
				'Test Description',
				'Electronics',
				JSON.stringify(['img1.jpg']),
				JSON.stringify({ price: 100 }),
				1234567890,
				1234567890,
			);
			expect(stmt.run).to.have.been.calledOnce;
		});

		it('should handle null values correctly', async () => {
			const productData = {
				productId: 'pro_123',
				sku: null,
				title: 'Test Product',
				description: null,
				category: null,
				images: [],
				metadata: {},
				now: 1234567890,
			};

			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true }),
			};

			env.DB.prepare.returns(stmt);

			await queries.createProduct(env, productData);

			expect(stmt.bind).to.have.been.calledWith(
				'pro_123',
				null,
				'Test Product',
				null,
				null,
				JSON.stringify([]),
				JSON.stringify({}),
				1234567890,
				1234567890,
			);
		});
	});

	describe('updateProduct', () => {
		it('should update product with provided fields', async () => {
			const updates = ['title = ?', 'description = ?'];
			const values = ['New Title', 'New Description', 'pro_123']; // productId must be included in values

			const stmt = {
				bind: sinon.stub().returnsThis(),
				run: sinon.stub().resolves({ success: true, changes: 1 }),
			};

			env.DB.prepare.returns(stmt);

			await queries.updateProduct(env, 'pro_123', updates, values);

			expect(env.DB.prepare).to.have.been.calledWith('UPDATE products SET title = ?, description = ? WHERE product_id = ?');
			expect(stmt.bind).to.have.been.calledWith('New Title', 'New Description', 'pro_123');
			expect(stmt.run).to.have.been.calledOnce;
		});
	});
});
