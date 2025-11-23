/**
 * Joi validation schemas for cart operations
 */
import Joi from 'joi';

export const addItemSchema = Joi.object({
	productId: Joi.string().required().messages({
		'string.empty': 'productId is required',
		'any.required': 'productId is required',
	}),
	variantId: Joi.string().optional().allow(null, ''),
	quantity: Joi.number().integer().min(1).default(1),
	unitPrice: Joi.number().min(0).optional(),
	title: Joi.string().optional(),
	attributes: Joi.object().optional(),
});

export const updateItemSchema = Joi.object({
	productId: Joi.string().required().messages({
		'string.empty': 'productId is required',
		'any.required': 'productId is required',
	}),
	variantId: Joi.string().optional().allow(null, ''),
	quantity: Joi.number().integer().min(0).required().messages({
		'number.base': 'quantity must be a number',
		'any.required': 'quantity is required',
	}),
});

export const removeItemSchema = Joi.object({
	productId: Joi.string().required().messages({
		'string.empty': 'productId is required',
		'any.required': 'productId is required',
	}),
	variantId: Joi.string().optional().allow(null, ''),
});

export const setAddressSchema = Joi.object({
	addressId: Joi.string().required().messages({
		'string.empty': 'addressId is required',
		'any.required': 'addressId is required',
	}),
});

export const selectShippingSchema = Joi.object({
	methodId: Joi.string().required().messages({
		'string.empty': 'methodId is required',
		'any.required': 'methodId is required',
	}),
});

export const applyCouponSchema = Joi.object({
	code: Joi.string().required().messages({
		'string.empty': 'Coupon code is required',
		'any.required': 'Coupon code is required',
	}),
});
