/**
 * Unit tests for response.js
 */
import { describe, it } from 'mocha';
import { jsonResponse, corsHeaders, handleOptions } from '../../../src/helpers/response.js';

describe('response', () => {
	describe('jsonResponse', () => {
		it('should create JSON response with default status 200', async () => {
			const body = { message: 'test' };
			const response = jsonResponse(body);

			expect(response.status).to.equal(200);
			expect(response.headers.get('content-type')).to.include('application/json');
			const data = await response.json();
			expect(data).to.deep.equal(body);
		});

		it('should create JSON response with custom status', async () => {
			const body = { error: 'not found' };
			const response = jsonResponse(body, 404);

			expect(response.status).to.equal(404);
			const data = await response.json();
			expect(data).to.deep.equal(body);
		});

		it('should include extra headers', async () => {
			const response = jsonResponse({}, 200, { 'X-Custom': 'value' });

			expect(response.headers.get('X-Custom')).to.equal('value');
		});
	});

	describe('corsHeaders', () => {
		it('should return CORS headers object', () => {
			const headers = corsHeaders();
			expect(headers).to.be.an('object');
		});
	});

	describe('handleOptions', () => {
		it('should return 204 response with CORS headers', async () => {
			const response = await handleOptions();

			expect(response.status).to.equal(204);
			expect(response.headers).to.exist;
		});
	});
});
