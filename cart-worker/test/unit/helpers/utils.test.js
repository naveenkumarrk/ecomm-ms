/**
 * Unit tests for helpers/utils.js
 */
import { describe, it } from 'mocha';
import { nowSec, createEmptyCart } from '../../../src/helpers/utils.js';

describe('utils', () => {
	describe('nowSec', () => {
		it('should return current timestamp in seconds', () => {
			const timestamp = nowSec();
			expect(timestamp).to.be.a('number');
			expect(timestamp).to.be.closeTo(Math.floor(Date.now() / 1000), 2);
		});
	});

	describe('createEmptyCart', () => {
		it('should create empty cart with cartId', () => {
			const cart = createEmptyCart('cart_123');
			expect(cart).to.have.property('cartId', 'cart_123');
			expect(cart).to.have.property('userId', null);
			expect(cart).to.have.property('items').that.is.an('array').with.length(0);
			expect(cart).to.have.property('summary');
			expect(cart.summary).to.have.property('subtotal', 0);
		});
	});
});
