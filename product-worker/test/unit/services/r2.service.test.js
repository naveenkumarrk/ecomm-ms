/**
 * Unit tests for r2.service.js
 */
import { describe, it, beforeEach } from 'mocha';
import { uploadImageToR2, handleImageUpload } from '../../../src/services/r2.service.js';
import sinon from 'sinon';

describe('r2.service', () => {
	describe('uploadImageToR2', () => {
		let mockEnv;
		let mockR2Bucket;

		beforeEach(() => {
			mockR2Bucket = {
				put: sinon.stub().resolves(),
			};

			mockEnv = {
				PRODUCT_IMAGES: mockR2Bucket,
				R2_PUBLIC_URL: 'https://example.com',
			};
		});

		it('should upload image to R2 and return public URL', async () => {
			const imageData = new Uint8Array(1000);
			const imageFile = new File([imageData], 'test.jpg', { type: 'image/jpeg' });

			const result = await uploadImageToR2(imageFile, mockEnv);

			expect(mockR2Bucket.put).to.have.been.calledOnce;
			expect(result).to.be.a('string');
			expect(result).to.include('https://example.com/products/');
			expect(result).to.include('test.jpg');
		});

		it('should throw error if R2 not configured', async () => {
			const imageFile = new File([new Uint8Array(100)], 'test.jpg');
			const envWithoutR2 = {};

			try {
				await uploadImageToR2(imageFile, envWithoutR2);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('R2 not configured');
			}
		});

		it('should throw error if file too large', async () => {
			// Create a file larger than 10MB
			const largeData = new Uint8Array(11 * 1024 * 1024);
			const largeFile = new File([largeData], 'large.jpg', { type: 'image/jpeg' });

			try {
				await uploadImageToR2(largeFile, mockEnv);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('File too large');
			}
		});

		it('should generate unique file path with timestamp and UUID', async () => {
			const imageFile = new File([new Uint8Array(100)], 'test.jpg');
			const result1 = await uploadImageToR2(imageFile, mockEnv);

			// Wait a bit to ensure different timestamp
			await new Promise((resolve) => setTimeout(resolve, 10));

			const result2 = await uploadImageToR2(imageFile, mockEnv);

			expect(result1).to.not.equal(result2);
			expect(mockR2Bucket.put).to.have.been.calledTwice;
		});
	});

	describe('handleImageUpload', () => {
		let mockEnv;
		let mockR2Bucket;
		let mockRequest;

		beforeEach(() => {
			mockR2Bucket = {
				put: sinon.stub().resolves(),
			};

			mockEnv = {
				PRODUCT_IMAGES: mockR2Bucket,
				R2_PUBLIC_URL: 'https://example.com',
			};
		});

		it('should handle multipart form data upload', async () => {
			const formData = new FormData();
			const imageFile = new File([new Uint8Array(100)], 'test.jpg', { type: 'image/jpeg' });
			formData.append('file', imageFile);

			mockRequest = {
				headers: {
					get: sinon.stub().withArgs('content-type').returns('multipart/form-data'),
				},
				formData: sinon.stub().resolves(formData),
			};

			const result = await handleImageUpload(mockRequest, mockEnv);

			expect(result).to.have.property('url');
			expect(result).to.have.property('path');
			expect(result).to.have.property('size', 100);
			expect(result).to.have.property('contentType', 'image/jpeg');
		});

		it('should handle direct binary upload', async () => {
			const imageData = new Uint8Array(200);

			mockRequest = {
				headers: {
					get: sinon.stub().withArgs('content-type').returns('image/png'),
				},
				arrayBuffer: sinon.stub().resolves(imageData),
			};

			const result = await handleImageUpload(mockRequest, mockEnv);

			expect(result).to.have.property('url');
			expect(result).to.have.property('size', 200);
			expect(result).to.have.property('contentType', 'image/png');
		});

		it('should throw error if no file provided in multipart', async () => {
			const formData = new FormData();

			mockRequest = {
				headers: {
					get: sinon.stub().withArgs('content-type').returns('multipart/form-data'),
				},
				formData: sinon.stub().resolves(formData),
			};

			try {
				await handleImageUpload(mockRequest, mockEnv);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('No file provided');
			}
		});

		it('should throw error if file is empty', async () => {
			const imageData = new Uint8Array(0);

			mockRequest = {
				headers: {
					get: sinon.stub().withArgs('content-type').returns('image/jpeg'),
				},
				arrayBuffer: sinon.stub().resolves(imageData),
			};

			try {
				await handleImageUpload(mockRequest, mockEnv);
				expect.fail('Should have thrown an error');
			} catch (error) {
				expect(error.message).to.include('Empty file');
			}
		});
	});
});
