/**
 * Address service - business logic for address operations
 */
import { dbGet, dbRun } from '../db/helpers.js';
import { USER_QUERIES } from '../db/queries.js';
import { parseUser, generateAddressId, epoch } from '../helpers/utils.js';

/**
 * Get user addresses
 */
export async function getUserAddresses(env, userId) {
	const row = await dbGet(env, USER_QUERIES.FIND_BY_ID, [userId]);
	if (!row) {
		throw new Error('user_not_found');
	}

	const data = parseUser(row);
	return data.addresses || [];
}

/**
 * Create a new address
 */
export async function createAddress(env, userId, addressData) {
	const row = await dbGet(env, USER_QUERIES.FIND_BY_ID, [userId]);
	if (!row) {
		throw new Error('user_not_found');
	}

	const data = parseUser(row);
	const newAddr = { addressId: generateAddressId(), ...addressData };

	if (!data.addresses) {
		data.addresses = [];
	}

	data.addresses.push(newAddr);

	await dbRun(env, USER_QUERIES.UPDATE_DATA, [JSON.stringify(data), epoch(), userId]);

	return newAddr;
}

/**
 * Update an address
 */
export async function updateAddress(env, userId, addressId, updateData) {
	const row = await dbGet(env, USER_QUERIES.FIND_BY_ID, [userId]);
	if (!row) {
		throw new Error('user_not_found');
	}

	const data = parseUser(row);
	if (!data.addresses) {
		data.addresses = [];
	}

	const idx = data.addresses.findIndex((a) => a.addressId === addressId);
	if (idx < 0) {
		throw new Error('address_not_found');
	}

	data.addresses[idx] = { ...data.addresses[idx], ...updateData };

	await dbRun(env, USER_QUERIES.UPDATE_DATA, [JSON.stringify(data), epoch(), userId]);

	return data.addresses[idx];
}

/**
 * Delete an address
 */
export async function deleteAddress(env, userId, addressId) {
	const row = await dbGet(env, USER_QUERIES.FIND_BY_ID, [userId]);
	if (!row) {
		throw new Error('user_not_found');
	}

	const data = parseUser(row);
	if (!data.addresses) {
		data.addresses = [];
	}

	const originalLength = data.addresses.length;
	data.addresses = data.addresses.filter((a) => a.addressId !== addressId);

	if (data.addresses.length === originalLength) {
		throw new Error('address_not_found');
	}

	await dbRun(env, USER_QUERIES.UPDATE_DATA, [JSON.stringify(data), epoch(), userId]);

	return { ok: true };
}
