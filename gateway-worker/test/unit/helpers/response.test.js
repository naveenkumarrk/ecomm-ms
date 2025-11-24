/**
 * Unit tests for response.js
 */
import { describe, it } from 'mocha';
import { jsonRes, corsHeaders } from '../../../src/helpers/response.js';
import { CORS_HEADERS } from '../../../src/config/constants.js';

describe('response.helpers', () => {
	describe('jsonRes', () => {
		it('should create a JSON response with default status 200', async () => {
			const data = { message: 'test' };
			const response = jsonRes(data);

			expect(response.status).to.equal(200);
			expect(response.headers.get('Content-Type')).to.equal('application/json');
			const body = await response.json();
			expect(body).to.deep.equal(data);
		});

		it('should create a JSON response with custom status', async () => {
			const data = { error: 'not found' };
			const response = jsonRes(data, 404);

			expect(response.status).to.equal(404);
			const body = await response.json();
			expect(body).to.deep.equal(data);
		});

		it('should include CORS headers', () => {
			const response = jsonRes({});

			Object.keys(CORS_HEADERS).forEach((key) => {
				expect(response.headers.get(key)).to.equal(CORS_HEADERS[key]);
			});
		});

		it('should handle complex data structures', async () => {
			const data = {
				nested: {
					array: [1, 2, 3],
					object: { key: 'value' },
				},
			};
			const response = jsonRes(data);

			const body = await response.json();
			expect(body).to.deep.equal(data);
		});
	});

	describe('corsHeaders', () => {
		it('should export CORS_HEADERS constant', () => {
			expect(corsHeaders).to.deep.equal(CORS_HEADERS);
		});
	});
});
