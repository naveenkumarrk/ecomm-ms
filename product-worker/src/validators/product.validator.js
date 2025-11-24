/**
 * Joi validation schemas for products
 */
import Joi from 'joi';

export const createProductSchema = Joi.object({
	productId: Joi.string().optional(),
	sku: Joi.string().max(100).optional().allow(null, ''),
	title: Joi.string().min(1).max(500).required().messages({
		'string.empty': 'Title is required',
		'string.min': 'Title must be at least 1 character',
		'string.max': 'Title must not exceed 500 characters',
	}),
	description: Joi.string().max(5000).optional().allow(null, ''),
	category: Joi.string().max(100).optional().allow(null, ''),
	images: Joi.alternatives().try(Joi.array().items(Joi.string().uri()), Joi.string().uri()).optional().default([]),
	metadata: Joi.object({
		price: Joi.number().min(0).optional(),
		weight: Joi.number().min(0).optional(),
		attributes: Joi.object().optional(),
	})
		.optional()
		.default({}),
});

export const updateProductSchema = Joi.object({
	sku: Joi.string().max(100).optional().allow(null, ''),
	title: Joi.string().min(1).max(500).optional(),
	description: Joi.string().max(5000).optional().allow(null, ''),
	category: Joi.string().max(100).optional().allow(null, ''),
	images: Joi.alternatives().try(Joi.array().items(Joi.string().uri()), Joi.string().uri()).optional(),
	metadata: Joi.object({
		price: Joi.number().min(0).optional(),
		weight: Joi.number().min(0).optional(),
		attributes: Joi.object().optional(),
	}).optional(),
});

export const getProductsQuerySchema = Joi.object({
	limit: Joi.number().integer().min(1).max(100).optional().default(20),
	offset: Joi.number().integer().min(0).optional().default(0),
});
