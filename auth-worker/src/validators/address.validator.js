/**
 * Joi validation schemas for addresses
 */
import Joi from 'joi';

export const createAddressSchema = Joi.object({
	line1: Joi.string().min(5).max(200).required().messages({
		'string.min': 'Address line 1 must be at least 5 characters',
		'string.max': 'Address line 1 must not exceed 200 characters',
		'any.required': 'Address line 1 is required',
	}),
	line2: Joi.string().max(200).optional().allow(''),
	city: Joi.string().min(2).max(100).required().messages({
		'string.min': 'City must be at least 2 characters',
		'string.max': 'City must not exceed 100 characters',
		'any.required': 'City is required',
	}),
	state: Joi.string().min(2).max(100).optional(),
	postal: Joi.string().min(5).max(20).required().messages({
		'string.min': 'Postal code must be at least 5 characters',
		'string.max': 'Postal code must not exceed 20 characters',
		'any.required': 'Postal code is required',
	}),
	country: Joi.string().min(2).max(100).default('US'),
});

export const updateAddressSchema = Joi.object({
	line1: Joi.string().min(5).max(200).optional(),
	line2: Joi.string().max(200).optional().allow(''),
	city: Joi.string().min(2).max(100).optional(),
	state: Joi.string().min(2).max(100).optional(),
	postal: Joi.string().min(5).max(20).optional(),
	country: Joi.string().min(2).max(100).optional(),
})
	.min(1)
	.messages({
		'object.min': 'At least one field must be provided for update',
	});
