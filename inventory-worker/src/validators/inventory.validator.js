/**
 * Joi validation schemas for inventory operations
 */
import Joi from 'joi';

export const reserveSchema = Joi.object({
	reservationId: Joi.string().required().messages({
		'string.empty': 'reservationId is required',
		'any.required': 'reservationId is required',
	}),
	cartId: Joi.string().optional().allow(null, ''),
	userId: Joi.string().optional().allow(null, ''),
	items: Joi.array()
		.items(
			Joi.object({
				productId: Joi.string().required(),
				qty: Joi.number().integer().min(1).required(),
				variantId: Joi.string().optional().allow(null, ''),
			}),
		)
		.min(1)
		.required()
		.messages({
			'array.min': 'At least one item is required',
			'any.required': 'items array is required',
		}),
	ttl: Joi.number().integer().min(60).max(3600).default(900),
});

export const commitSchema = Joi.object({
	reservationId: Joi.string().required().messages({
		'string.empty': 'reservationId is required',
		'any.required': 'reservationId is required',
	}),
});

export const releaseSchema = Joi.object({
	reservationId: Joi.string().required().messages({
		'string.empty': 'reservationId is required',
		'any.required': 'reservationId is required',
	}),
});

export const productStockSchema = Joi.object({
	productId: Joi.string().required().messages({
		'string.empty': 'productId is required',
		'any.required': 'productId is required',
	}),
});
