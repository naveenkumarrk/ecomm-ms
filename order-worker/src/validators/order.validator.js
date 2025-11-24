/**
 * Joi validation schemas for orders
 */
import Joi from 'joi';

export const createOrderSchema = Joi.object({
	reservationId: Joi.string().required().messages({
		'string.empty': 'reservationId is required',
		'any.required': 'reservationId is required',
	}),
	orderId: Joi.string().optional(),
	payment: Joi.object({
		paymentId: Joi.string().required(),
		amount: Joi.number().min(0).required(),
		currency: Joi.string().length(3).default('USD'),
		method: Joi.string().optional(),
	})
		.required()
		.messages({
			'any.required': 'payment object is required',
		}),
	userId: Joi.string().optional().allow(null, ''),
	email: Joi.string().email().optional().allow(null, ''),
	items: Joi.array()
		.items(
			Joi.object({
				productId: Joi.string().required(),
				qty: Joi.number().integer().min(1).required(),
				unitPrice: Joi.number().min(0).required(),
				title: Joi.string().optional(),
			}),
		)
		.min(1)
		.default([]),
	address: Joi.object().optional().allow(null),
	shipping: Joi.object().optional().allow(null),
});
