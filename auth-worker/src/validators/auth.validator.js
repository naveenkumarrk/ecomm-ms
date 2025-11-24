/**
 * Joi validation schemas for authentication
 */
import Joi from 'joi';

export const signupSchema = Joi.object({
	email: Joi.string().email().required().messages({
		'string.email': 'Invalid email format',
		'any.required': 'Email is required',
	}),
	password: Joi.string().min(8).required().messages({
		'string.min': 'Password must be at least 8 characters long',
		'any.required': 'Password is required',
	}),
	name: Joi.string().min(2).max(100).required().messages({
		'string.min': 'Name must be at least 2 characters long',
		'string.max': 'Name must not exceed 100 characters',
		'any.required': 'Name is required',
	}),
});

export const loginSchema = Joi.object({
	email: Joi.string().email().required().messages({
		'string.email': 'Invalid email format',
		'any.required': 'Email is required',
	}),
	password: Joi.string().required().messages({
		'any.required': 'Password is required',
	}),
});

export const adminSignupSchema = Joi.object({
	email: Joi.string().email().required().messages({
		'string.email': 'Invalid email format',
		'any.required': 'Email is required',
	}),
	password: Joi.string().min(8).required().messages({
		'string.min': 'Password must be at least 8 characters long',
		'any.required': 'Password is required',
	}),
	name: Joi.string().min(2).max(100).required().messages({
		'string.min': 'Name must be at least 2 characters long',
		'string.max': 'Name must not exceed 100 characters',
		'any.required': 'Name is required',
	}),
	adminSecret: Joi.string().optional(),
});

export const promoteUserSchema = Joi.object({
	email: Joi.string().email().optional(),
	userId: Joi.string().optional(),
})
	.or('email', 'userId')
	.messages({
		'object.missing': 'Either email or userId is required',
	});
