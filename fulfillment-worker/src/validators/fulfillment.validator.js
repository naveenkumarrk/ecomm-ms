/**
 * Joi validation schemas for fulfillment operations
 */
import Joi from 'joi';

export const getOptionsSchema = Joi.object({
	items: Joi.array()
		.items(
			Joi.object({
				productId: Joi.string().required(),
				variantId: Joi.string().optional().allow(null, ''),
				qty: Joi.number().integer().min(1).required(),
				unitPrice: Joi.number().min(0).optional(),
				weight: Joi.number().min(0).optional(),
				attributes: Joi.object({
					weight: Joi.number().min(0).optional(),
				}).optional(),
			}),
		)
		.min(1)
		.required()
		.messages({
			'array.min': 'At least one item is required',
			'any.required': 'items array is required',
		}),
	address: Joi.object({
		pincode: Joi.string().optional(),
		postal: Joi.string().optional(),
		zip: Joi.string().optional(),
	}).optional(),
	couponCode: Joi.string().optional().allow(null, ''),
	subtotal: Joi.number().min(0).default(0),
});

export const allocateSchema = Joi.object({
	orderId: Joi.string().optional(),
	reservationId: Joi.string().optional(),
	items: Joi.array()
		.items(
			Joi.object({
				variantId: Joi.string().optional(),
				qty: Joi.number().integer().min(1).required(),
			}),
		)
		.min(1)
		.required(),
	address: Joi.object({
		pincode: Joi.string().optional(),
	}).optional(),
	methodId: Joi.string().optional(),
});

export const shipSchema = Joi.object({
	orderId: Joi.string().required().messages({
		'string.empty': 'orderId is required',
		'any.required': 'orderId is required',
	}),
	allocation: Joi.array()
		.items(
			Joi.object({
				warehouseId: Joi.string().optional(),
				tracking: Joi.string().optional(),
				carrier: Joi.string().optional(),
				eta: Joi.string().optional(),
			}),
		)
		.optional(),
	shippedAt: Joi.number().optional(),
});
