/**
 * Joi validation schemas for payment operations
 */
import Joi from 'joi';

export const createPaymentSchema = Joi.object({
	reservationId: Joi.string().required().messages({
		'string.empty': 'reservationId is required',
		'any.required': 'reservationId is required',
	}),
	amount: Joi.number().min(0).required().messages({
		'number.base': 'amount must be a number',
		'number.min': 'amount must be >= 0',
		'any.required': 'amount is required',
	}),
	currency: Joi.string().length(3).default('USD'),
	returnUrl: Joi.string().uri().optional(),
	userId: Joi.string().required().messages({
		'string.empty': 'userId is required',
		'any.required': 'userId is required',
	}),
	metadata: Joi.object().optional(),
});

export const capturePaymentSchema = Joi.object({
	paypalOrderId: Joi.string().required().messages({
		'string.empty': 'paypalOrderId is required',
		'any.required': 'paypalOrderId is required',
	}),
	reservationId: Joi.string().required().messages({
		'string.empty': 'reservationId is required',
		'any.required': 'reservationId is required',
	}),
});
